var q = require('q');
/**
 * User Routes
 * @type {Object}
 */
module.exports = function (Benchmark, mongoose, Publisher, _, async, SQS, ConversationModel, UserModel, MessageModel, Config) {

  var queueMessage = function (message, user) {
    SQS.sendMessage({
      QueueUrl: "https://sqs.us-east-1.amazonaws.com/"+
        Config.aws.awsAccountId+"/"+Config.aws.queuePrefix+user._id,
      MessageBody: JSON.stringify(message),
      DelaySeconds: 0
    }, function (err, data) {
      Publisher.publish('messages:new', JSON.stringify(user));
    });
  }

  return {
    send: function (req, res) {
      if(!req.params.cid) {
        res.json(500, {error: "No conversation id!"});
      }

      if(!req.body) {
        res.json(500, {error: "req.body is empty!"});
      }

      if(!req.body.text) {
        res.json(500, {error: "Message was empty!"});
      }

      var msg = new MessageModel.model();
      msg._id = mongoose.Types.ObjectId();
      Benchmark.send('ws-message:'+req.params.cid+':'+msg._id);
      Benchmark.send('post-message:'+req.params.cid+':'+msg._id);

      var tasks = [];

      ConversationModel.model.findOne({_id: req.params.cid, $or: [
          {from: req.session.user._id},
          {to: req.session.user._id},
        ]}
        , function (err, conversation) {
          var id;
          if(conversation.from.toString() === req.session.user._id) {
            id = conversation.to.toString();
          } else {
            id = conversation.from.toString();
          }
          UserModel.model.findOne({_id: id}
          , function (err, user) {
            if(err || !user) {
              res.json(500, err, user);
            } else if (user) {
              user = JSON.parse(JSON.stringify(user));
              msg.text = req.body.text;
              msg.from = req.session.user._id;
              msg.to = user._id;
              queueMessage({
                cid: conversation._id,
                mid: msg._id,
                text: req.body.text,
                from: msg.from,
                to: msg.to
              }, user);
              conversation.messages.push(msg);
              conversation.save(function (err) {
                Benchmark.send('post-message:'+req.params.cid+':'+msg._id);
                if(err) {
                  res.json(500, err);
                } else {
                  res.json(200,conversation);
                }
              });
            } else {
              Benchmark.send('post-message:'+req.params.cid+':'+msg._id);
              res.json(500, {error: "Crap! No user!"});
            }
          });
        });
    }
  }
}
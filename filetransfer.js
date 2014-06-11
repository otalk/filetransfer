var async = require('async');
var webrtcsupport = require('webrtcsupport');
var WildEmitter = require('wildemitter');
var util = require('util');
var crypto = require('crypto');

function Sender() {
    WildEmitter.call(this);
    var self = this;
    this.chunksize = 768;
    this.pacing = 50;
    this.file = null;
    this.channel = null;

    this.sha = crypto.createHash('sha1');

    // paced sender
    // TODO: do we have to do this?
    this.processingQueue = async.queue(function (task, next) {
        var reader = new window.FileReader();
        reader.onload = (function() {
            return function(e) {
                self.emit('progress', task.start, task.file.size);
                self.channel.send(e.target.result);
                window.setTimeout(next, self.pacing); // pacing

                // as lance points out, xep-0234 allows us to update the hash
                // later, so we can calculate it based on the chunks
                //self.sha.update(e.target.result);
                //console.log('hash', sha.digest('hex'));
            };
        })(task.file);
        var slice = task.file.slice(task.start, task.start + task.chunksize);
        reader.readAsArrayBuffer(slice);
    });
}
util.inherits(Sender, WildEmitter);

Sender.prototype.send = function (file, channel) {
    this.file = file;

    this.channel = channel;
    // FIXME: hook to channel.onopen?
    for (var start = 0; start < this.file.size; start += this.chunksize) {
        this.processingQueue.push({
            file: file,
            start: start,
            chunksize: this.chunksize
        });
    }
};

function Receiver() {
    WildEmitter.call(this);
    this.receiveBuffer = [];
    this.received = 0;
    this.metadata = {};
    this.channel = null;
}
util.inherits(Receiver, WildEmitter);

Receiver.prototype.receive = function (metadata, channel) {
    var self = this;
    if (metadata) {
        this.metadata = metadata;
    }
    this.channel = channel;
    this.channel.onmessage = function (event) {
        // weird
        var len = webrtcsupport.prefix === 'moz' ? event.data.size : event.data.byteLength;
        self.received += len;
        self.receiveBuffer.push(event.data);
        self.emit('progress', self.received, self.metadata.size);
        if (self.received == self.metadata.size) {
            self.emit('receivedFile', new window.Blob(self.receiveBuffer), self.metadata);
            // FIXME: discard? close channel?
        } else if (self.received > self.metadata.size) {
            // FIXME
            console.error('received more than expected, discarding...');
            self.receiveBuffer = []; // just discard...

        }
    };
};

module.exports = {};
module.exports.support = window && window.File && window.FileReader && window.Blob;
module.exports.Sender = Sender;
module.exports.Receiver = Receiver;

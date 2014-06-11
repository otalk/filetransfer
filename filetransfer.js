var async = require('async');
var webrtcsupport = require('webrtcsupport');
var WildEmitter = require('wildemitter');
var util = require('util');

// if (!(window.File && window.FileReader && window.FileList && window.blob)) 
//    notsupported
console.log(webrtcsupport);

function Sender() {
    WildEmitter.call(this);
    var self = this;
    this.chunksize = 768;
    this.pacing = 50;
    this.file = null;
    this.channel = null;

    // paced sender
    // TODO: do we have to do this?
    this.processingQueue = async.queue(function (task, next) {
        var reader = new window.FileReader();
        reader.onload = (function() {
            return function(e) {
                self.emit('progress', task.start, task.file.size);
                self.channel.send(e.target.result);
                window.setTimeout(next, self.pacing); // pacing
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
        if (webrtcsupport.prefix === 'moz') {
            self.received += event.data.size;
        } else {
            self.received += event.data.byteLength; 
        }
        // FIXME: what if > filesize?
        self.receiveBuffer.push(event.data);
        self.emit('progress', self.received, self.metadata.size);
        if (self.received == self.metadata.size) {
            self.emit('receivedFile', new Blob(self.receiveBuffer), self.metadata);
            // FIXME: discard? close channel?
        }
    };
};

module.exports = {};
module.exports.support = window && window.File && window.FileReader && window.Blob;
module.exports.Sender = Sender;
module.exports.Receiver = Receiver;

var async = require('async');
//var webrtcsupport = require('webrtcsupport');
var WildEmitter = require('wildemitter');
var util = require('util');
var hashes = require('iana-hashes');

function Sender(opts) {
    WildEmitter.call(this);
    var self = this;
    var options = opts || {};
    this.config = {
        chunksize: 16384,
        pacing: 10,
        hash: 'sha-1' // note: this uses iana hash names
    };
    // set our config from options
    var item;
    for (item in options) {
        this.config[item] = options[item];
    }

    this.file = null;
    this.channel = null;
    this.hash = null;

    // paced sender
    // TODO: do we have to do this?
    this.processingQueue = async.queue(function (task, next) {
        if (task.type == 'chunk') {
            var reader = new window.FileReader();
            reader.onload = (function() {
                return function(e) {
                    self.channel.send(e.target.result);

                    self.hash.update(new Uint8Array(e.target.result));

                    self.emit('progress', task.start, task.file.size);

                    window.setTimeout(next, self.config.pacing); // pacing
                };
            })(task.file);
            var slice = task.file.slice(task.start, task.start + task.size);
            reader.readAsArrayBuffer(slice);
        } else if (task.type == 'complete') {
            self.emit('sentFile', {hash: self.hash.digest('hex'), algo: self.config.hash });
            next();
        }
    });
}
util.inherits(Sender, WildEmitter);

Sender.prototype.send = function (file, channel) {
    this.file = file;
    this.hash = hashes.createHash(this.config.hash);

    this.channel = channel;
    // FIXME: hook to channel.onopen?
    for (var start = 0; start < this.file.size; start += this.config.chunksize) {
        this.processingQueue.push({
            type: 'chunk',
            file: file,
            start: start,
            size: this.config.chunksize
        });
    }
    this.processingQueue.push({
        type: 'complete'
    });
};

function Receiver(opts) {
    WildEmitter.call(this);

    var options = opts || {};
    this.config = {
        hash: 'sha-1'
    };
    // set our config from options
    var item;
    for (item in options) {
        this.config[item] = options[item];
    }
    this.receiveBuffer = [];
    this.received = 0;
    this.metadata = {};
    this.channel = null;
    this.hash = null;
}
util.inherits(Receiver, WildEmitter);

Receiver.prototype.receive = function (metadata, channel) {
    var self = this;

    if (metadata) {
        this.metadata = metadata;
    }
    this.hash = hashes.createHash(this.config.hash);

    this.channel = channel;
    // chrome only supports arraybuffers and those make it easier to calc the hash
    channel.binaryType = 'arraybuffer';
    this.channel.onmessage = function (event) {
        var len = event.data.byteLength;
        self.received += len;
        self.receiveBuffer.push(event.data);

        self.hash.update(new Uint8Array(event.data));

        self.emit('progress', self.received, self.metadata.size);
        if (self.received == self.metadata.size) {
            self.metadata.actualhash = self.hash.digest('hex');
            self.emit('receivedFile', new window.Blob(self.receiveBuffer), self.metadata);
            self.receiveBuffer = []; // discard receivebuffer
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

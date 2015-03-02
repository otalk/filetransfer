var util = require('util');
var hashes = require('iana-hashes');
var base = require('./filetransfer');

// drop-in replacement for filetransfer which also calculates hashes
function Sender(opts) {
    base.Sender.call(this, opts);
    var self = this;

    var options = opts || {};
    if (!options.hash) {
        options.hash = 'sha-1';
    }
    this.hash = hashes.createHash(options.hash);

    this.on('progress', function (start, size, data) {
        self.emit('progress', start, size, data);
        if (data) {
            self.hash.update(new Uint8Array(data));
        }
    });
    this.on('sentFile', function () {
        self.emit('sentFile', {hash: self.hash.digest('hex'), algo: self.config.hash });
    });
}
util.inherits(Sender, base.Sender);

function Receiver(opts) {
    base.Receiver.call(this, opts);
    var self = this;

    var options = opts || {};
    if (!options.hash) {
        options.hash = 'sha-1';
    }
    this.hash = hashes.createHash(options.hash);

    this.on('progress', function (start, size, data) {
        self.emit('progress', start, size, data);
        if (data) {
            self.hash.update(new Uint8Array(data));
        }
    });
    this.on('receivedFile', function (file, metadata) {
        metadata.actualhash = self.hash.digest('hex');
        self.emit('receivedFile', file, metadata);
    });
}
util.inherits(Receiver, base.Receiver);

module.exports = {};
module.exports.support = base.support;
module.exports.Sender = Sender;
module.exports.Receiver = Receiver;

var fs = require('fs');
var path = require('path');
var util = require('util');
var mkdirp = require('mkdirp');
var Transform = require('stream').Transform;
var UnzipStream = require('./unzip-stream');

function Extract (opts) {
    if (!(this instanceof Extract))
    return new Extract(opts);

    Transform.call(this);

    this.opts = opts || {};
    this.unzipStream = new UnzipStream();
    this.unfinishedEntries = [];

    var self = this;
    this.unzipStream.on('entry', this._processEntry.bind(this));
    this.unzipStream.on('error', function(error) {
        self.emit('error', error);
    });
}

util.inherits(Extract, Transform);

Extract.prototype._transform = function (chunk, encoding, cb) {
    this.unzipStream.write(chunk, encoding, cb);
}

Extract.prototype._flush = function (cb) {
    var self = this;
    var allDone = function() {
        process.nextTick(function() { self.emit('close'); });
        cb();
    }

    this.unzipStream.end(function() {
        if (self.unfinishedEntries.length === 0) return allDone();

        var waitingEntries = self.unfinishedEntries.length;
        var finishedFn = function() {
            waitingEntries--;
            if (waitingEntries === 0) return allDone();
        }
        for(var i=0; i < waitingEntries; i++) {
            self.unfinishedEntries[i].on('finish', finishedFn);
        }
    });
}

Extract.prototype._processEntry = function (entry) {
    var self = this;
    var destPath = path.join(this.opts.path, entry.path);
    var directory = entry.isDirectory ? destPath : path.dirname(destPath);

    mkdirp(directory, function(err) {
        if (err) return self.emit('error', err);
        if (entry.isDirectory) return;

        var pipedStream = fs.createWriteStream(destPath);
        self.unfinishedEntries.push(pipedStream);
        pipedStream.on('finish', function() {
            var idx = self.unfinishedEntries.indexOf(pipedStream);
            if (idx < 0) return;
            self.unfinishedEntries.splice(idx, 1);
        });
        pipedStream.on('error', function (error) {
            self.emit('error', error);
        });
        entry.pipe(pipedStream);
    });
}

module.exports = Extract;
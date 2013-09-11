var writable = require('./writable.js');
var each = require('./each.js');

module.exports = fetch;
function fetch(socket, repo, opts, callback) {

  var read = socket.read,
      write = socket.write,
      abort = socket.abort;
  var onProgress = opts.onProgress,
      onError = opts.onError,
      wants = opts.wants,
      caps = opts.caps;
  var cb;

  wants.map(function (hash, i) {
    if (i) {
      return "want " + hash + "\n";
    }
    return "want " + hash + " " + caps.join(" ") + "\n";
  }).forEach(write);
  write(null);
  return repo.listRefs(function (err, refs) {
    if (err) return callback(err);
    var haves = Object.keys(refs);
    if (haves.length) {
      haves.map(function (ref) {
        return "have " + refs[ref] + "\n";
      }).forEach(write);
      write(null);
      return read(onAck);
    }
    write("done\n");
    return read(onAck);
  });

  function onAck(err, ack) {
    if (err) return callback(err);
    if (ack.trim() !== "NAK") write("done\n");
    return callback(null, { read: packRead, abort: abort });
  }

  function packRead(callback) {
    if (cb) return callback(new Error("Only one read at a time"));
    cb = callback;
    read(onItem);
  }

  function onItem(err, item) {
    var callback = cb;
    if (item === undefined) {
      cb = null;
      return callback(err);
    }
    if (item) {
      if (item.progress) {
        if (onProgress) onProgress(item.progress);
        return read(onItem);
      }
      if (item.error) {
        if (onError) onError(item.error);
        return read(onItem);
      }
    }
    if (!item) return read(onItem);
    cb = null;
    return callback(null, item);
  }

}

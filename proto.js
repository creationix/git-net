module.exports = function (platform, agent) {

  return {
    discover: discover,
    fetch: fetch
  };

  function discover(socket, callback) {
    var read = socket.read;

    var refs = {};
    var caps = null;

    read(onLine);

    function onLine(err, line) {
      if (err) return callback(err);
      if (line === null) {
        return callback(null, refs, caps);
      }
      line = line.trim();
      if (!caps) line = pullCaps(line);
      var index = line.indexOf(" ");
      refs[line.substr(index + 1)] = line.substr(0, index);
      read(onLine);
    }

    function pullCaps(line) {
      var index = line.indexOf("\0");
      caps = {};
      line.substr(index + 1).split(" ").map(function (cap) {
        var pair = cap.split("=");
        caps[pair[0]] = pair[1] || true;
      });
      return line.substr(0, index);
    }
  }

  function fetch(socket, opts, callback) {
    var read = socket.read,
        write = socket.write,
        abort = socket.abort;
    var want = opts.want,
        have = opts.have,
        onProgress = opts.onProgress,
        onError = opts.onError,
        refs = opts.refs,
        serverCaps = opts.caps;

    var caps = [];
    if (serverCaps["ofs-delta"]) caps.push("ofs-delta");
    if (serverCaps["thin-pack"]) caps.push("thin-pack");
    if (opts.includeTag && serverCaps["include-tag"]) caps.push("include-tag");
    if ((onProgress || onError) &&
        (serverCaps["side-band-64k"] || serverCaps["side-band"])) {
      caps.push(serverCaps["side-band-64k"] ? "side-band-64k" : "side-band");
      if (!onProgress && serverCaps["no-progress"]) {
        caps.push("no-progress");
      }
    }
    if (serverCaps.agent) caps.push("agent=" + agent);

    if (want) throw new Error("TODO: Implement dynamic wants");
    if (have) throw new Error("TODO: Implement dynamic have");

    var wants = [];
    each(refs, function (name, hash) {
      if (name === "HEAD" || name.indexOf('^') > 0) return;
      wants.push("want " + hash);
    });

    wants[0] += " " + caps.join(" ");
    wants.forEach(function (want) {
      write(want + "\n");
    });
    write(null);
    write("done\n");
    var packStream = writable(abort);

    read(function (err, nak) {
      if (err) return callback(err);
      if (nak.trim() !== "NAK") {
        return callback(Error("Expected NAK"));
      }
      callback(null, {
        read: packStream.read,
        abort: packStream.abort,
        refs: refs
      });
      read(onItem);
    });

    function onItem(err, item) {
      if (err) return packStream.error(err);
      if (item) {
        if (item.progress) {
          if (onProgress) onProgress(item.progress);
        }
        else if (item.error) {
          if (onError) onError(item.error);
        }
        else {
          packStream(item);
        }
      }
      if (item === undefined) {
        packStream(undefined);
      }
      else read(onItem);
    }

  }

};

function writable(abort) {
  var queue = [];
  var emit = null;

  write.read = read;
  write.abort = abort;
  write.error = error;
  return write;

  function write(item) {
    queue.push([null, item]);
    check();
  }

  function error(err) {
    queue.push([err]);
    check();
  }

  function read(callback) {
    if (queue.length) {
      return callback.apply(null, queue.shift());
    }
    if (emit) return callback(new Error("Only one read at a time"));
    emit = callback;
    check();
  }

  function check() {
    if (emit && queue.length) {
      var callback = emit;
      emit = null;
      callback.apply(null, queue.shift());
    }
  }
}

function each(obj, fn) {
  var keys = Object.keys(obj);
  for (var i = 0, l = keys.length; i < l; i++) {
    var key = keys[i];
    fn(key, obj[key]);
  }
}
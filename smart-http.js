module.exports = function (platform) {
  var writable = require('./writable.js');
  var sharedDiscover = require('./discover.js');
  var pushToPull = require('push-to-pull');
  var pktLine = require('./pkt-line.js')(platform);
  var framer = pushToPull(pktLine.framer);
  var deframer = pushToPull(pktLine.deframer);
  var http = platform.http;
  var trace = platform.trace;
  var bops = platform.bops;
  var agent = platform.agent;
  var urlParse = require('./url-parse.js');

  // opts.hostname - host to connect to (github.com)
  // opts.pathname - path to repo (/creationix/conquest.git)
  // opts.port - override default port (80 for http, 443 for https)
  return function (opts) {
    opts.tls = opts.protocol === "https:";
    opts.port = opts.port ? opts.port | 0 : (opts.tls ? 443 : 80);
    if (!opts.hostname) throw new TypeError("hostname is a required option");
    if (!opts.pathname) throw new TypeError("pathname is a required option");

    opts.discover = discover;
    opts.fetch = fetch;
    opts.close = closeConnection;

    return opts;

    function addDefaults(extras) {

      var headers = {
        "User-Agent": agent,
        "Host": opts.hostname,
      };

      // Hack to workaround gist bug.
      // https://github.com/creationix/js-git/issues/25
      if (opts.hostname === "gist.github.com") {
        headers["User-Agent"] = "git/1.8.1.2";
        headers["X-Real-User-Agent"] = agent;
      }

      for (var key in extras) {
        headers[key] = extras[key];
      }
      return headers;
    }

    function get(path, headers, callback) {
      http.request({
        method: "GET",
        hostname: opts.hostname,
        tls: opts.tls,
        port: opts.port,
        auth: opts.auth,
        path: opts.pathname + path,
        headers: addDefaults(headers)
      }, callback);
    }

    function buffer(body, callback) {
      var parts = [];
      body.read(onRead);
      function onRead(err, item) {
        if (err) return callback(err);
        if (item === undefined) {
          return callback(null, bops.join(parts));
        }
        parts.push(item);
        body.read(onRead);
      }
    }

    function post(path, headers, body, callback) {
      headers = addDefaults(headers);
      if (typeof body === "string") {
        body = bops.from(body);
      }
      if (bops.is(body)) {
        headers["Content-Length"] = body.length;
      }
      else {
        if (headers['Transfer-Encoding'] !== 'chunked') {
          return buffer(body, function (err, body) {
            if (err) return callback(err);
            headers["Content-Length"] = body.length;
            send(body);
          });
        }
      }
      send(body);
      function send(body) {
        http.request({
          method: "POST",
          hostname: opts.hostname,
          tls: opts.tls,
          port: opts.port,
          auth: opts.auth,
          path: opts.pathname + path,
          headers: headers,
          body: body
        }, callback);
      }
    }

    // Send initial git-upload-pack request
    // outputs refs and caps
    function discover(callback) {
      if (!callback) return discover.bind(this);
      get("/info/refs?service=git-upload-pack", {
        "Accept": "*/*",
        "Accept-Encoding": "gzip",
        "Pragma": "no-cache"
      }, function (err, code, headers, body) {
        if (err) return callback(err);
        if (code !== 200) return callback(new Error("Unexpected status code " + code));
        if (headers['content-type'] !== 'application/x-git-upload-pack-advertisement') {
          return callback(new Error("Wrong content-type in server response"));
        }

        body = deframer(body);
        if (trace) body = trace("input", body);

        body.read(function (err, line) {
          if (err) return callback(err);
          if (line.trim() !== '# service=git-upload-pack') {
            return callback(new Error("Missing expected service line"));
          }
          body.read(function (err, line) {
            if (err) return callback(err);
            if (line !== null) {
              return callback(new Error("Missing expected terminator"));
            }
            sharedDiscover(body, callback);
          });
        });
      });
    }

    function fetch(repo, opts, callback) {
      if (!callback) return fetch.bind(this, repo, opts);
      var onProgress = opts.onProgress,
          onError = opts.onError,
          wants = opts.wants,
          caps = opts.caps;

      if (!wants.length) return callback();

      var write = writable();
      var output = {
        read: write.read,
        abort: write.abort
      };
      if (trace) output = trace("output", output);
      output = framer(output);

      post("/git-upload-pack", {
        "Content-Type": "application/x-git-upload-pack-request",
        "Accept": "application/x-git-upload-pack-result",
      }, output, onResponse);

      wants.map(function (hash, i) {
        if (i) {
          return "want " + hash + "\n";
        }
        return "want " + hash + " " + caps.join(" ") + "\n";
      }).forEach(write);
      write(null);
      return repo.listRefs("refs", function (err, refs) {
        if (err) return callback(err);
        var haves = Object.keys(refs);
        if (haves.length) {
          haves.map(function (ref) {
            return "have " + refs[ref] + "\n";
          }).forEach(write);
        }
        write("done\n");
        write();
      });

      function onResponse(err, code, headers, body) {
        if (err) return callback(err);
        if (code !== 200) return callback(new Error("Unexpected status code " + code));
        if (headers['content-type'] !== 'application/x-git-upload-pack-result') {
          return callback(new Error("Wrong content-type in server response"));
        }
        body = deframer(body);
        var cb;
        if (trace) body = trace("input", body);
        var read = body.read;
        return read(onAck);

        function onAck(err, ack) {
          if (err) return callback(err);
          return callback(null, { read: packRead, abort: body.abort });
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
    }

    function closeConnection(callback) {
      if (!callback) return closeConnection.bind(this);
      callback();
    }
  };
};
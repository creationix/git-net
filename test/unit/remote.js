var kMockPlatform = {
  bops: { from: function() { } },
  fs: {},
  tcp: {},
  http: {},
  ssh: {},
  sha1: {},
  inflate: {},
  deflate: {},
  trace: {},
  ws: function() {}
};

var remote = require("../../remote.js")(kMockPlatform);

exports.fileScheme = {
  notSupported: function(test) {
    // No scheme -> file://
    test.throws(function() {
      return remote("./test.git");
    }, "file: urls are not currently supported.");

    // Explicit file:// scheme
    test.throws(function() {
      return remote("file://test.git");
    }, "file: urls are not currently supported.");

    // Invalid scheme -> file://
    test.throws(function() {
      return remote("~file://test.git");
    }, "file: urls are not currently supported.");
    test.done();
  }
};

exports.gitScheme = {
  supported: function(test) {
    test.doesNotThrow(function() {
      return remote("git://test.org/repo.git");
    });
    test.done();
  }
};

exports.httpScheme = {
  supported: function(test) {
    test.doesNotThrow(function() {
      return remote("http://test.org/repo.git");
    });

    test.doesNotThrow(function() {
      return remote("https://test.org/repo.git");
    });
    test.done();
  }
};

exports.unknownScheme = {
  notSupported: function(test) {
    test.throws(function() {
      return remote("httpz://test.org/repo.git");
    }, "Unknown protocol httpz:");
    test.done();
  }
};

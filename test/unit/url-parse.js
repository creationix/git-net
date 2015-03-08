var urlParse = require("../../url-parse");

exports.protocol = {
  defaultWhenNoScheme: function(test) {
    test.equal(urlParse("./testFile.git").protocol, "file:");
    test.done();
  },

  defaultWhenInvalidScheme: function(test) {
    test.equal(urlParse("-file://testFile.git").protocol, "file:");
    test.done();
  },

  fileScheme: function(test) {
    test.equal(urlParse("file:///home/repo.git").protocol, "file:");
    test.done();
  },

  gitScheme: function(test) {
    test.equal(urlParse("git://host/repos/repo.git").protocol, "git:");
    test.done();
  },

  httpScheme: function(test) {
    test.equal(urlParse("http://host.com/repos/repo.git").protocol, "http:");
    test.equal(urlParse("https://host.com/repos/repo.git").protocol, "https:");
    test.done();
  },

  wsScheme: function(test) {
    test.equal(urlParse("ws://host.com/repos/repo.git").protocol, "ws:");
    test.equal(urlParse("wss://host.com/repos/repo.git").protocol, "wss:");
    test.done();
  },

  sshScheme: function(test) {
    test.equal(urlParse("ssh://host.com/repos/repo.git").protocol, "ssh:");
    test.done();
  },
};

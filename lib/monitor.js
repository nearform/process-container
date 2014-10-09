'use strict';

var spawnCommand = require('spawn-command');

module.exports = function(cmd, options) {
  var child;
  var keepAlive = true;

  var spawn = function() {
    child = spawnCommand(cmd, options);
    child.on('exit', function(code, signal) {
      if (keepAlive) {
        child.emit('respawn', code, signal);
        setTimeout(spawn, options.respawnTimeout || 100);
      }
    });
  };

  var kill = function(sig) {
    keepAlive = false;
    child.kill(sig);
  };

  spawn();

  return {
    child: child,
    kill: kill
  };
};

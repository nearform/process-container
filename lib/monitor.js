'use strict';

var chokidar = require('chokidar');
var spawn = require('spawn-command');
var fs = require('fs');

module.exports = function(cmd, cwd, logger, logFile, cb) {

  var watcher = chokidar.watch(cwd, {ignored: /[\/\\]\./, persistent: true});
  var stopping = false;

  function start() {
    if (stopping) {
      return;
    }
    logger.info('starting');
    var child = spawn(cmd, { cwd: cwd });
    var stream = fs.createWriteStream(logFile, { flags: 'a' });

    // no input
    child.stdin.end();
    child.stdout.pipe(stream);
    child.stderr.pipe(stream);

    watcher.child = child;

    child.on('exit', function(code) {
      logger.info({ childPid: child.pid, code: code }, 'dead');
      if (code) {
        if (cb) {
          cb(new Error('unable to start ' + cmd + ' in folder ' + cwd));
          cb = null;
        }
        return;
      }
      setTimeout(start, 500);
    });

    setTimeout(function() {
      logger.info({ childPid: child.pid }, 'running');
      if (cb) {
        cb(null);
        cb = null;
      }
    }, 200);
  }

  function kill() {
    if (watcher.child) {
      logger.info({ childPid: watcher.child.pid }, 'killing');
      watcher.child.kill('SIGKILL');
      watcher.child = null;
    }
  }

  watcher.on('ready', start);
  watcher.on('change', kill);

  watcher.kill = function() {
    stopping = true;
    kill();
    this.close();
  };

  return watcher;
};

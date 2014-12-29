'use strict';

var chokidar = require('chokidar');
var spawn = require('spawn-command');
var fs = require('fs');

function dockerHostIp() {
  var split;
  if (process.env.DOCKER_HOST) {
    split = /tcp:\/\/([0-9.]+):([0-9]+)/g.exec(process.env.DOCKER_HOST);
    if (split) {
      return split[1];
    }
  }
  return '127.0.0.1';
}

module.exports = function(cmd, cwd, logger, logFile, cb) {

  var watcher = chokidar.watch(cwd, {ignored: /[\/\\]\./, persistent: true});
  var stopping = false;

  function start() {
    if (stopping) {
      return;
    }

    logger.info('starting');
    var env = Object.create(process.env);
    env.DOCKER_HOST_IP = dockerHostIp();

    var child = spawn(cmd, {
      cwd: cwd,
      env: env
    });

    child.on('error', function(err) {
      logger.error(err)
    });

    if (cb) {
      child.on('error', cb);
    }

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

    setTimeout(function() {
      watcher.on('change', kill);
    }, 15000);
  }

  function kill() {
    if (watcher.child) {
      watcher.removeListener('change', kill);
      logger.info({ childPid: watcher.child.pid }, 'killing');
      watcher.child.kill('SIGKILL');
      watcher.child = null;
    }
  }

  watcher.on('ready', start);

  watcher.kill = function() {
    stopping = true;
    kill();
    this.close();
  };

  return watcher;
};

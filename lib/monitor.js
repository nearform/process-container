'use strict';

var chokidar = require('chokidar');
var spawn = require('child_process').spawn;
var pump = require('pump');
var fs = require('fs');

// needed to support nvm and local env variables
var baseCmd = 'test -f ~/.bashrc && source ~/.bashrc; test -f ~/.bash_profile && source ~/.bash_profile; exec ';

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

module.exports = function(cmd, cwd, watch, logger, logFile, cb) {

  var watcher = chokidar.watch(watch, {ignored: /[\/\\]\./, persistent: true});
  var stopping = false;

  watcher.on('change', kill);

  function start() {
    if (stopping) {
      return;
    }

    logger.info('starting');
    var env = Object.create(process.env);
    env.DOCKER_HOST_IP = dockerHostIp();

    var toExec = baseCmd + cmd;

    var child = spawn('/bin/bash', ['-c', toExec], {
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
    pump(child.stdout, stream);
    pump(child.stderr, stream);

    watcher.child = child;

    child.on('exit', function(code) {
      logger.info({ childPid: child.pid, code: code }, 'dead');
      watcher.child = null;

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

  function kill(cb) {
    if (watcher.child) {
      logger.info({ childPid: watcher.child.pid }, 'killing');
      watcher.child.removeAllListeners('exit');
      if (cb) {
        watcher.child.on('exit', function() {
          // swallow the error
          cb();
        });
      }
      watcher.child.kill('SIGKILL');
      watcher.child = null;
    } else if (cb) {
      cb();
    }
  }

  watcher.on('ready', start);

  watcher.kill = function(cb) {
    stopping = true;
    kill(cb);
    this.close();
  };

  return watcher;
};

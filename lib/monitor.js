/*
 * THIS SOFTWARE IS PROVIDED ``AS IS'' AND ANY EXPRESSED OR IMPLIED
 * WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES
 * OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED.  IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY DIRECT,
 * INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
 * HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT,
 * STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING
 * IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */

'use strict';

var chokidar = require('chokidar-child');
var spawn = require('child_process').spawn;
var pump = require('pump');
var fs = require('fs');
var through2 = require('through2');
var path = require('path');

// needed to support nvm and local env variables
var baseCmd = 'test -f ~/.bashrc && source ~/.bashrc; test -f ~/.bash_profile && source ~/.bash_profile; exec ';

var dataDir = path.join(process.env.HOME, '/.nscale/data/');

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



module.exports = function spawnMonitor(cmd, cwd, watch, logger, logFile, ignored, cb) {

  ignored = ignored.map(function(p) {
    if (typeof p === 'string') {
      return path.join(cwd, p);
    }
    return p;
  });

  var watcherArgs = {
    ignored: ignored,
    persistent: true,
    ignoreInitial: true,
    cwd: cwd
  };
  var watcher = chokidar.watch(watch, watcherArgs);
  var stopping = false;
  var child;

  watcher.on('childDead', function(pid, exit, signal) {
    logger.info({
      watch: watch,
      args: watcherArgs,
      watcherPid: pid,
      exit: exit,
      signal: signal
    }, 'watcher child died');
  });

  logger.info({ watch: watch, args: watcherArgs }, 'starting watcher');

  function start() {
    if (stopping) {
      return;
    }

    logger.info('starting');
    var env = Object.create(process.env);
    env.DOCKER_HOST_IP = dockerHostIp();

    var toExec = baseCmd + cmd;

    // technique adapted from http://npm.im/spawn-command
    child = spawn('/bin/bash', ['-c', toExec], {
      cwd: cwd,
      env: env
    });

    var pid = child.pid;

    child.on('error', function(err) {
      logger.error(err)
    });

    if (cb) {
      child.on('error', cb);
    }

    var stream = fs.createWriteStream(logFile, { flags: 'a' });
    var setKillSwitch = null

    // no input
    child.stdin.end();
    pump(child.stdout, stream);
    pump(child.stderr, stream);

    var killStream = through2(function(chunk, enc, cb) {
      if (setKillSwitch) {
        clearTimeout(setKillSwitch);
      }
      setKillSwitch = setTimeout(function() {
        if (child) {
          logger.info({ pid: pid }, 'kill on change set up');
          watcher.on('change', kill);
          child.stdout.unpipe(killStream);
        }
      }, 500);
      cb();
    });

    child.stdout.pipe(killStream);

    child.on('exit', function(code) {
      logger.info({ pid: pid, code: code }, 'dead');

      // delete the pid file do nothing if it's missing
      try {
        fs.unlinkSync(path.join(dataDir, String(pid) + '.pid'));
      } 
      catch (err) {
        logger.error(err);
      }
      child = null;

      if (code && cb) {
        cb(new Error('unable to start ' + cmd + ' in folder ' + cwd));
        cb = null;
        return;
      }

      watcher.removeAllListeners('change');
      setTimeout(start, 500);
    });

    setTimeout(function() {
      logger.info({ pid: pid }, 'running');
      writePidFile(pid, function(err) {
        if (err) { logger.error(err); }
        logger.debug('pid file written');
        if (cb) {
          cb(null);
          cb = null;
        }
      });
    }, 200);
  }

  function kill(cb) {
    if (child) {
      var logObj = {
        pid: child.pid
      };

      if (typeof cb === 'function') {
        child.on('exit', function() {
          // swallow the error
          cb();
        });
      } 
      else {
        logObj.changed = cb;
      }

      logger.info(logObj, 'killing');
      child.kill('SIGKILL');
      child = null;
    } 
    else if (typeof cb === 'function') {
      cb();
    }
  }

  function writePidFile(pid, cb) {
    var pidFile = path.join(dataDir, String(pid) + '.pid');
    fs.writeFile(pidFile, pid, function(err) {
      if (err) { cb(err); }
      cb();
    });
  }

  watcher.kill = function(cb) {
    stopping = true;
    kill(cb);
    this.close();
  };

  start();

  return watcher;
};

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

var fs = require('fs-extra');
var pathFromRepoUrl = require('./helpers').pathFromRepoUrl;
var path = require('path');
var spawn = require('child_process').spawn;



module.exports = function(logger) {
  var baseCmd = 'test -f ~/.bashrc && source ~/.bashrc; test -f ~/.bash_profile && source ~/.bash_profile; exec ';

  var tryOutput = function(str, out) {
    try { out.stdout(str); } catch(err) {}
  };



  var dockerHostIp = function() {
    var split;
    if (process.env.DOCKER_HOST) {
      split = /tcp:\/\/([0-9.]+):([0-9]+)/g.exec(process.env.DOCKER_HOST);
      if (split) {
        return split[1];
      }
    }
    return '127.0.0.1';
  };



  var preview = function(containerDef, out) {
    if (containerDef && containerDef.specific && containerDef.specific.execute && containerDef.specific.execute.process) {
      out.preview({cmd: containerDef.specific.execute.process, host: 'localhost'});
    }
    else {
      out.preview({cmd: 'missing execute block for container: ' + containerDef.id + ' deploy will fail', host: 'localhost'});
    }
  };



  var writePidFile = function(pid, container, cb) {
    var dataDir = path.join(process.env.HOME, '/.nscale/data/');
    var pidFile = path.join(dataDir, String(pid) + '.pid');
    var content = {pid: pid,
                   containerId: container.id,
                   containerDefinitionId: container.containerDefinitionId};

    fs.writeFile(pidFile, JSON.stringify(content, null, 2), cb);
  };



  var run = function(system, container, containerDef, out, cb) {
    var toExec;
    var cmd;
    var cwd;
    var env;
    var child;
    var logDir;


    cmd = containerDef.specific.execute.process;
    cwd = pathFromRepoUrl(system, containerDef);
    if (containerDef.specific.execute.cwd) {
      cwd = path.join(cwd, containerDef.specific.execute.cwd);
    }

    logDir = path.join(system.repoPath, 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirsSync(logDir);
    }
    toExec = baseCmd + cmd + ' >' + logDir + '/' + container.name + '.log' + ' 2>' + logDir + '/' + container.name + '.errors';

    if (!cmd) { 
      return cb(new Error('missing execute.process in service definition'), {});
    }
    env = Object.create(process.env);
    env.DOCKER_HOST_IP = dockerHostIp();
    child = spawn('/bin/bash', ['-c', toExec], {cwd: cwd, env: env, detached: true,});
    child.unref();

    //var child = cp.spawn('gnome-open', [MANFILE], { detached: true, stdio: [ 'ignore', out, err ] });
//    - point to log file

    child.on('error', function(err) {
      logger.error('process ' + cmd + ' failed with error ' + err);
      tryOutput('process ' + cmd + ' failed with error ' + err, out);
    });

    child.on('exit', function(code) {
      logger.error('process ' + cmd + ' exited with code ' + code);
      tryOutput('process ' + cmd + ' exited with code ' + code, out);
    });

    cb(null, child.pid);
  };



  var start = function(mode, target, system, containerDef, container, out, cb) {
    logger.info('starting');
    out.stdout('starting');

    if (mode === 'preview') {
      preview(containerDef, out);
      return cb();
    }
    else {
      if (!(containerDef && containerDef.specific && containerDef.specific.execute && containerDef.specific.execute.process)) {
        return cb(new Error('missing execute block for container: ' + containerDef.id + ' aborting'));
      }
    }

    run(system, container, containerDef, out, function(err, pid) {
      if (mode !== 'preview') {
        writePidFile(pid, container, cb);
      }
      else {
        cb();
      }
    });
  };



  var stop = function() {
  };



  return {
    start: start,
    stop: stop,
  };
};


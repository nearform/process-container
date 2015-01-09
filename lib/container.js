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

var path = require('path');
var bunyan = require('bunyan');
var spawnMonitor = require('./monitor.js');
var executor = require('nscale-util').executor();

var reSsh = /([a-zA-Z0-9_.-]+)\@([a-zA-Z0-9_.-]+):[a-zA-Z0-9_.-]+\/([a-zA-Z0-9_.-]+)\.git(?:\#([a-zA-Z0-9_.-]+))?/i;
var reHttp = /https?:\/\/(?:([a-zA-Z0-9_.-\\%]+)(?::([a-zA-Z0-9_.-]+))@){0,1}([a-zA-Z0-9_.-]+)\/(?:[a-zA-Z0-9_.-]+\/)+([a-zA-Z0-9_-]+)(?:\.git){0,1}(?:\#([a-zA-Z0-9_.-]+)){0,1}/i;

// copied from kutils.js in kernel
// TODO refactor into separate module
function parseGitUrl(url) {
  var rpath;
  var result;

  if (url.indexOf('http') === 0) {
    rpath = reHttp.exec(url);
    result = {user: rpath[1] || 'git', pass: rpath[2], host: rpath[3], repo: rpath[4], branch: rpath[5] || 'master'};
  }
  else {
    rpath = reSsh.exec(url);
    result = {user: rpath[1], host: rpath[2], repo: rpath[3], branch: rpath[4] || 'master'};
  }

  return result;
};

function pathFromRepoUrl(system, containerDef) {
  var uh = parseGitUrl(containerDef.specific.repositoryUrl);
  var p = path.join(system.repoPath, 'workspace', uh.repo);
  return p;
}

module.exports = function(config, logger) {
  var logDir = path.join(config.root, 'log');
  var monitors = {};

  logger = logger || bunyan.createLogger({name: 'process-container'});

  /**
   * build the container
   * system - the system definition
   * cdef - contianer definition block
   * out - ouput stream
   * cb - complete callback
   */
  var build = function build(mode, system, cdef, out, cb) {
    logger.info('building');
    out.stdout('building');

    var cmd = cdef.specific.processBuild;

    if (!cmd) { return cb(null, {}); }

    if (!cdef.specific.repositoryUrl) { return cb(new Error('missing repositoryUrl'), {}); }

    executor.exec(mode, cmd, pathFromRepoUrl(system, cdef), out, cb);
  };



  /**
   * deploy the continaer
   * target - target to deploy to
   * system - the target system defintinion
   * cdef - the contianer definition
   * container - the container as defined in the system topology
   * out - ouput stream
   * cb - complete callback
   */
  var deploy = function deploy(mode, target, system, containerDef, container, out, cb) {
    logger.info('deploying');
    out.stdout('deploying');
    cb();
  };



  /**
   * undeploy the container from the target
   * target - target to deploy to
   * system - the target system defintinion
   * cdef - the contianer definition
   * container - the container as defined in the system topology
   * out - ouput stream
   * cb - complete callback
   */
  var undeploy = function undeploy(mode, target, system, containerDef, container, out, cb) {
    logger.info('undeploying');
    out.stdout('undeploying');
    cb();
  };



  /**
   * start the container on the target
   * target - target to deploy to
   * system - the target system defintinion
   * cdef - the contianer definition
   * container - the container as defined in the system topology
   * out - ouput stream
   * cb - complete callback
   */
  var start = function start(mode, target, system, containerDef, container, out, cb) {
    logger.info('starting');
    out.stdout('starting');

    var cmd = containerDef.specific.execute.process;
    var dead = false;

    if (!cmd) { return cb(new Error('missing execute.process in service definition'), {}); }

    var cwd = pathFromRepoUrl(system, containerDef);
    var watch = containerDef.specific.execute.watch;

    if (containerDef.specific.execute.cwd) {
      cwd = path.join(cwd, containerDef.specific.execute.cwd);
    }

    if (typeof watch === 'string') {
      watch = [watch];
    } else if (!Array.isArray(watch)) {
      watch = [cwd];
    }

    watch = watch.map(function(file) {
      return path.resolve(cwd, file)
    });

    var childLog = logger.child({ id: container.id, cmd: cmd, cwd: cwd });
    var logFile = path.join(logDir, container.id + '.log');

    if (monitors[container.id]) {
      childLog.info('child running for this system already, killing it');
      monitors[container.id].kill();
    }

    childLog.info('spawning');
    monitors[container.id] = spawnMonitor(cmd, cwd, watch, childLog, logFile, function(err) {
      if (err) {
        return cb(err);
      }
      out.stdout('> tail -f ' + logFile + ' # to access the process log');
      cb();
    });
  };



  /**
   * stop the container on the target
   * target - target to deploy to
   * system - the target system defintinion
   * cdef - the contianer definition
   * container - the container as defined in the system topology
   * out - ouput stream
   * cb - complete callback
   */
  var stop = function stop(mode, target, system, containerDef, container, out, cb) {
    logger.info('stopping');
    out.stdout('stopping');
    if (monitors[container.id]) { monitors[container.id].kill(); }
    cb();
  };



  /**
   * link the container to the target
   * target - target to deploy to
   * system - the target system defintinion
   * cdef - the contianer definition
   * container - the container as defined in the system topology
   * out - ouput stream
   * cb - complete callback
   */
  var link = function link(mode, target, system, containerDef, container, out, cb) {
    logger.info('linking');
    out.stdout('linking');
    cb();
  };



  /**
   * unlink the container from the target
   * target - target to deploy to
   * system - the target system defintinion
   * cdef - the contianer definition
   * container - the container as defined in the system topology
   * out - ouput stream
   * cb - complete callback
   */
  var unlink = function unlink(mode, target, system, containerDef, container, out, cb) {
    logger.info('unlinking');
    out.stdout('unlinking');
    cb();
  };



  return {
    build: build,
    deploy: deploy,
    start: start,
    stop: stop,
    link: link,
    unlink: unlink,
    undeploy: undeploy,
    add: deploy,
    remove: undeploy
  };
};


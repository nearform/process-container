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
var buildService = require('./service');
var pathFromRepoUrl = require('./helpers').pathFromRepoUrl;
var executor = require('nscale-util').executor();
var parseGitUrl = require('./helpers').parseGitUrl;

module.exports = function(config, logger) {
  var logDir = path.join(config.root, 'log');
  var service = config.startedService;

  logger = logger || bunyan.createLogger({name: 'process-container'});


  /**
   * build the container
   * system - the system definition
   * cdef - contianer definition block
   * out - ouput stream
   * cb - complete callback
   */
  var build = function build(mode, system, cdef, out, cb) {
    var cmd = cdef.specific.processBuild || cdef.specific.build;

    logger.info('building');
    out.stdout('building');

    if (!cmd) { return cb(null, {}); }
    if (!cdef.specific.repositoryUrl) { return cb(new Error('missing repositoryUrl'), {}); }

    var branch = parseGitUrl(cdef.specific.repositoryUrl).branch;

    if (cdef.specific.commit) {
      var synchCommand =  [
        [
          ' ( ' +
          'test `git show --format="format:%H"` = ' + cdef.specific.commit,
          ' && ',
          'git checkout -q ' + branch,
          ' ) ',
          ' || ',
          'git checkout -q ' + cdef.specific.commit
        ].join(' '),
        'echo checked out ' + cdef.specific.commit,
      ].join(' && ');

      executor.exec(mode, synchCommand, pathFromRepoUrl(system, cdef), out, function(err) {
        if (err) { return cb(err); }
        executor.exec(mode, cmd, pathFromRepoUrl(system, cdef), out, cb);
      });
    }
    else {
      executor.exec(mode, cmd, pathFromRepoUrl(system, cdef), out, cb);
    }
  };



  /**
   * deploy the continaer
   * target - target to deploy to
   * system - the target system defintinion
   * cdef - the contianer definition
   * container - the container as defined in the system topology
   * out - ouput stream
   * cb - complete callback
   *
   * for process containers deploy requires a build if moving between revisions
   * right now just forcing a build on changing revisions this will occur on each build
   * which is sub optimal.
   */
  var deploy = function deploy(mode, target, system, containerDef, container, out, cb) {
    logger.info('deploying');
    out.stdout('deploying');
    if (mode === 'preview') {
      cb();
    }
    else {
      build(mode, system, containerDef, out, function(err) {
        cb(err);
      });
    }
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
    service.startContainer(mode, target, system, containerDef, container, out, cb);
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
    service.stopContainer(mode, target, system, containerDef, container, out, cb);
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
    remove: undeploy,
    service: buildService(config, logger)
  };
};


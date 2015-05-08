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

var handleRogueProcesses = require('./handler');
var pathFromRepoUrl = require('./helpers').pathFromRepoUrl;
var path = require('path');
var spawnMonitor = require('./monitor');
var executor = require('nscale-util').executor();
var async = require('async');

module.exports = function buildService(config, logger) {

  return function start(cb) {
    handleRogueProcesses(logger, function(err) {
      if (err) { logger.debug(err); }
      cb(err, new MonitorService(config, logger));
    });
  }
}

function MonitorService(config, logger) {
  this._monitors = {};
  this.logger = logger;
  this.logDir = path.join(config.root, 'log');
}

MonitorService.prototype.monitors = function(system) {
  var id = system.id || system;
  this._monitors[id] = this._monitors[id] || {};
  return this._monitors[id];
};

MonitorService.prototype.getMonitor = function(system, container) {
  return this.monitors(system)[container.id]
};

MonitorService.prototype.getDeployedContainers = function(system) {
  var monitors = this.monitors(system);
  return Object.keys(monitors).map(function(key) {
    return monitors[key].container;
  })
};

MonitorService.prototype.getDeployedDefinitions = function(system) {
  var monitors = this.monitors(system);
  return Object.keys(monitors).map(function(key) {
    return monitors[key].containerDef;
  })
};

MonitorService.prototype.startContainer = function(mode, target, system, containerDef, container, out, cb) {
  var logger = this.logger;

  logger.info('starting');
  out.stdout('starting');

  if (mode === 'preview') {
    return cb();
  }

  var cmd = containerDef.specific.execute.process;
  var dead = false;
  var that = this;

  if (!cmd) { return cb(new Error('missing execute.process in service definition'), {}); }

  var cwd = pathFromRepoUrl(system, containerDef);
  var watch = containerDef.specific.execute.watch;

  if (containerDef.specific.execute.cwd) {
    cwd = path.join(cwd, containerDef.specific.execute.cwd);
  }

  if (typeof watch === 'string') {
    watch = [watch];
  } else if (!Array.isArray(watch)) {
    watch = ['.'];
  }

  var childLog = logger.child({ id: container.id, cmd: cmd, cwd: cwd });
  var logFile = path.join(this.logDir, container.id + '.log');

  if (this.getMonitor(system, container)) {
    childLog.info('child running for this system already, killing it');
    this.getMonitor(system, container).kill(complete);
  } else {
    complete();
  }

  function complete() {
    childLog.info('spawning');
    container.specific = container.specific || {};
    var ignored = [/[\/\\]\./, /node_modules/].concat(container.specific.ignored ? container.specific.ignored : []);
    that.monitors(system)[container.id] = spawnMonitor(cmd, cwd, watch, childLog, logFile, ignored, function(err) {
      if (err) {
        return cb(err);
      }

      that.getMonitor(system, container).container = container;
      that.getMonitor(system, container).containerDef = containerDef;

      out.stdout('> tail -f \'' + logFile + '\' # to access the process log');
      cb();
    });
  }
};

MonitorService.prototype.stopContainer = function (mode, target, system, containerDef, container, out, cb) {
  this.logger.info('stopping');
  out.stdout('stopping');

  if (mode === 'preview') {
    return cb();
  }

  var monitor = this.getMonitor(system, container.id);
  if (monitor) {
    return monitor.kill(function (err) {
      delete that._monitors[system.id][container.id];
      cb(err);
    });
  }
  cb();
};

MonitorService.prototype.close = function(cb) {
  var that = this;
  async.each(Object.keys(this._monitors), function(sys, cb) {
    async.each(Object.keys(that._monitors[sys]), function(key, cb) {
      that.logger.info({ system: sys, container: key }, 'killing');
      that._monitors[sys][key].kill(cb);
    }, cb)
  }, function (err) {
    that._monitors = {}
    cb(err);
  });
};

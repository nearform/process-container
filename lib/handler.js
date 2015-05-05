/**
* helper file for handling leftover processes which may not have been killed off
* e.g. is nscale was killed with SIGKILL
* this file finds those processes and kills them off
*/

var ps = require('ps-node');
var fs = require('fs');
var path = require('path');
var async = require('async');

var dataDir = path.join(process.env.HOME, '/.nscale/data/');

module.exports = function(logger, cb) {

var handleRogueProcesses = function(cb) {
    checkForPidFiles(function(err, pids) {
      if (err) { cb(err); }
      if (pids) {
        logger.debug('found leftover pidfiles', pids);
        killProcesses(pids, function(err) {
          if (err) { cb(err); }
          cb();
        });
      }
      else { cb(); }
    });
};

/**
  *  internal function which checks for the existence of leftover pid files
  *  a leftover pid file may exist if nscale was killed with SIGKILL 
  *  while process containers were running
  */
  var checkForPidFiles = function(cb) {
    var dir = path.join(process.env.HOME, '/.nscale/data');

    fs.readdir(dir, function(err, files) {
      if (err) { cb(err); }
      async.filter(files, function(file, callback) { callback(file.indexOf('.pid') > 0); }, function(pidFiles) {
        (pidFiles.length > 0) ? cb(null, pidFiles): cb();
      });
    });
  };

  /**
   *  internal function which finds rogue processes and kills them off
   *  pidFiles - the files supplied from the _checkForPidFiles function
   */
  var killProcesses = function(pidFiles, cb) {
    
    function onNextFile(pidFile, callback) {
      var pid = pidFile.replace('.pid', '')

      ps.lookup({'pid': pid}, function(err, resultList) {
        if (err) { callback(err) }
        var rogueProcess = resultList[0];
        fs.unlinkSync(path.join(dataDir, pidFile));
        if (rogueProcess) {
          ps.kill(pid, function(err) {
            if (err) {logger.error(err); callback(err);}
            logger.debug('killed rogue process', pid);
            callback(null);
          });
        }
        else {
          callback(null)
        }
      });
    }

    async.each(pidFiles, onNextFile, cb);
  };

  handleRogueProcesses(cb);
}
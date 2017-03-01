'use strict';

// find sense hat matrix framebuffer
const fb = require('./findFB.js');

const cb = require('./callback_fb.js')(fb);
const p = require('./promise_fb.js')(fb);
const sync = require('./sync_fb.js')(fb);
const getAngle = require('./rotation.js').getAngle;
const gamma = require('./gamma.js')(fb);

const rotation = {
  get rotation() {
    return getAngle();
  },
  set rotation(r) {
    sync.setRotation(r, true);
  }
};

module.exports = Object.assign(cb, rotation, gamma);
module.exports.sync = Object.assign(sync, rotation, gamma);
module.exports.promise = Object.assign(p, rotation, gamma);

require('./shared/admin');

const health = require('./shared/health');
const offers = require('./offers');
const openHouse = require('./openHouse');
const billing = require('./billing');
const messaging = require('./messaging');
const buyer = require('./buyer');
const ai = require('./ai');
const automations = require('./automations');
const teams = require('./teams');
const account = require('./account');

module.exports = {
  ...health,
  ...offers,
  ...openHouse,
  ...billing,
  ...messaging,
  ...buyer,
  ...ai,
  ...automations,
  ...teams,
  ...account,
};

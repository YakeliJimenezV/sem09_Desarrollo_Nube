const Role = require('../models/Role');
const { ROLE_NAMES } = require('../config/security');

async function initializeRoles() {
  await Role.bulkWrite(ROLE_NAMES.map((name) => ({
    updateOne: {
      filter: { name },
      update: { $setOnInsert: { name, permissions: [] } },
      upsert: true,
    },
  })));
}

module.exports = { initializeRoles };

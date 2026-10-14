const auth = require('../services/auth.service');
const Store = require('../models/Store');

async function register(request, response) { response.status(201).json(await auth.register(request.body)); }
async function login(request, response) { response.json(await auth.login(request.body)); }
function me(request, response) { response.json({ user: auth.publicUser(request.user) }); }
async function logout(request, response) { await auth.logout(request.user); response.status(204).end(); }
async function stores(request, response) { response.json({ stores: await Store.find({ active: true }).select('name').sort({ name: 1 }).lean() }); }

module.exports = { register, login, me, logout, stores };

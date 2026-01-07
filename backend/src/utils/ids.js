const { v4: uuidv4 } = require('uuid');
const newId = () => uuidv4();
module.exports = { newId };

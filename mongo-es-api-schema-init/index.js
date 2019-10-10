const init_schema = require('./init_schema')
const init_mongo = require('./init_mongo')
const init_es = require('./init_es')

const initialize = async ()=>{
    await init_schema.initialize()
    await init_mongo.initialize()
    await init_es.initialize()
}

module.exports = {initialize}


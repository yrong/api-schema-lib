const config = require('config')
const _ = require('lodash')
const apiSchema = require('api-schema-core')


const initJsonSchema = async ()=>{
    const option = {redisOption:config.get('redis'),prefix:process.env['SCHEMA_TYPE']}
    await apiSchema.initSchemas(option)
    console.log("load schema to redis success!")
}

const initialize = async ()=>{
    await initJsonSchema()
}

module.exports = {initialize}


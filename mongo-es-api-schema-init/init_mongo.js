const config = require('config')
const _ = require('lodash')
const apiSchema = require('api-schema-core')
const MongoDB = require('mongodb')
const muri = require('muri')
const MongoClient = MongoDB.MongoClient

const initMongo = async ()=>{
    let mongoUrl = config.get('mongo').url, dbName = muri(mongoUrl.replace('+srv', '')).db
    let client = await MongoClient.connect(mongoUrl, { useNewUrlParser: true, reconnectTries: 1 })
    let db = client.db(dbName)
    const schemas = apiSchema.getSchemas()
    for(let category of _.keys(schemas)){
        let collection = schemas[category].collection
        if(collection){
            await db.createCollection(collection)
            await db.collection(collection).createIndex({uuid:1})
        }
    }
    console.log("init schema in mongodb success!")
}


const initialize = async ()=>{
    const option = {redisOption:config.get('redis'),prefix:process.env['SCHEMA_TYPE']}
    await apiSchema.loadSchemas(option)
    await initMongo()
}

module.exports = {initialize}


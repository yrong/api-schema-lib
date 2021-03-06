const _ = require('lodash')
const redis = require('redis')
const RedisCache = require("node-cache-redis")
const common = require('api-schema-common')
const apiSchema = require('api-schema-core')
const delimiter = common.Delimiter

let cache,client,prefix,cache_loadUrl={}

const initialize = async (option)=>{
    if(!option.redisOption||!option.prefix){
        throw new Error('required field missing when initialize cache')
    }
    let redisOption = _.assign({db:3},option.redisOption)
    cache = new RedisCache({
        redisOptions: redisOption,
        poolOptions: {priorityRange: option.priorityRange||1}
    })
    client = redis.createClient(redisOption);
    prefix = `${option.prefix}:`
    await apiSchema.loadSchemas(option)
    let schemas = apiSchema.getSchemas(),service_url
    if(_.isEmpty(schemas)){
        throw new Error('load schema failed')
    }
    _.each(schemas,(schema,category)=>{
        if(schema.route&&schema.service){
            cache_loadUrl[category] = `${common.getServiceApiUrl(schema.service)}${schema.route}`
        }
    })
}

const set = async (key,val)=>{
    return await cache.set(prefix+key,val)
}

const get = async (key)=>{
    return await cache.get(prefix+key)
}

const del = async (key)=>{
    return await cache.del(prefix+key)
}

const flushAll = async ()=>{
    return new Promise((resolve, reject) => {
        client.eval("return redis.call('del', 'default-template',unpack(redis.call('keys', ARGV[1])))", 0, prefix+'*', (err, res) => {
            if(err)
                reject(err)
            else
                resolve(res)
        })
    })
}

const addItem = async (item)=>{
    let schema_obj = apiSchema.getAncestorSchema(item.category)
    if(schema_obj.cache&&schema_obj.cache.ignore)
        return
    if(schema_obj.cache&&schema_obj.cache.fields)
        item = _.pick(item,schema_obj.cache.fields)
    if(schema_obj.cache&&schema_obj.cache.exclude_fields)
        item = _.omit(item,schema_obj.cache.exclude_fields)
    if(item.uuid)
        await set(item.uuid,item)
    if(item.category&&item.unique_name){
        await set(item.category + delimiter + item.unique_name,item)
    }
    return item
}

const delItem = async (item)=>{
    let schema_obj = apiSchema.getAncestorSchema(item.category)
    if(schema_obj.cache&&schema_obj.cache.ignore)
        return
    if (item.uuid)
        await del(item.uuid)
    if (item.category&&item.unique_name)
        await del(item.category + delimiter + item.unique_name)
}

const loadAll = async ()=>{
    let result,load_url
    await flushAll()
    for(let category in cache_loadUrl){
        load_url = cache_loadUrl[category]
        try{
            result = await common.apiInvoker('GET',load_url,'',{'original':true})
        }catch(err){
            console.log(`load err:` + err)
        }
        result = result.data||result
        if(result&&result.length){
            for (let item of result){
                await addItem(item)
            }
        }
    }

}

const loadOne = async (category,uuid)=>{
    let item,load_url
    load_url = cache_loadUrl[category]
    if(!load_url){
        console.error(`missing load_url for ${category}`)
        return
    }
    try{
        item = await common.apiInvoker('GET',load_url,`/${uuid}`,{'original':true})
    }catch(err){
        console.error(`load ${category} ${uuid} err:` + err)
    }
    if(item){
        item = item.data||item
        if(!_.isEmpty(item)){
            item.category = category
            item = await addItem(item)
        }
    }
    return item
}


const getItemByCategoryAndUniqueName = async (category,unique_name)=>{
    let result = await get(category+delimiter+unique_name)
    return result
}

const getItemByCategoryAndID = async (category,uuid)=>{
    let result = await get(uuid)
    if(!result){
        result = await loadOne(category,uuid)
    }
    return result
};


module.exports = {loadAll,flushAll,getItemByCategoryAndUniqueName,getItemByCategoryAndID,initialize,addItem,delItem}

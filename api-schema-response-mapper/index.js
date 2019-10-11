'use strict';

const _ = require('lodash')
const apiSchema = require('api-schema-core')
const apiSchemaCache = require('api-schema-cache')
const apiSchemaCommon = require('api-schema-common')

const replaceId = async (category,key,val)=>{
    if(_.isString(val[key])||apiSchemaCommon.isLegacyUserId(category,val[key])){
        let obj = await apiSchemaCache.getItemByCategoryAndID(apiSchema.getAncestorCategory(category),val[key].toString())
        if(!_.isEmpty(obj)){
            val[key] = obj
        }
    }
}

const replaceIdArray = async (category,key,val)=>{
    let objs = []
    for(let id of val[key]){
        if(_.isString(id)||apiSchemaCommon.isLegacyUserId(category,id)){
            let obj = await apiSchemaCache.getItemByCategoryAndID(apiSchema.getAncestorCategory(category),id)
            if(!_.isEmpty(obj)){
                objs.push(obj)
            }else{
                objs.push({category,uuid:id})
            }
        }
    }
    val[key] = objs
}

const replaceObj = async (val,props)=>{
    if(_.isObject(val)&&props){
        for(let key in props){
            if(val[key]&&props[key].schema){
                if(_.isString(val[key])){
                    await replaceId(props[key].schema,key,val)
                }
            }
        }
    }
    return val
}

const referencedObjectMapper = async (val,params)=>{
    let properties = apiSchema.getSchemaProperties(val.category||params.category),objs,obj
    for (let key in val) {
        if (val[key] && properties[key]) {
            if(properties[key].type==='string'&&properties[key].schema){
                await replaceId(properties[key].schema,key,val)
            }
            else if(properties[key].type==='array'&&properties[key].items&&properties[key].items.type){
                if(properties[key].items.type==='string'&&properties[key].items.schema){
                    await replaceIdArray(properties[key].items.schema,key,val)
                }
                else if (properties[key].type === 'array' && properties[key].items.type === 'object') {
                    for (let entry of val[key]) {
                        entry = await replaceObj(entry, properties[key].items.properties)
                    }
                }

            }else if(properties[key].type==='object') {
                val[key] = await replaceObj(val[key], properties[key].properties)
            }
        }
    }
    return val
}

const parse2JsonObject = async (val,params)=>{
    let properties = apiSchema.getSchemaProperties(val.category||params.category)
    for (let key in val) {
        if (val[key] && properties[key]) {
            if (properties[key].type === 'object' || (properties[key].type === 'array' && properties[key].items.type === 'object')) {
                if (_.isString(val[key])) {
                    try{
                        val[key] = JSON.parse(val[key])
                    }catch(err){
                        //ignore
                    }
                }
            }
        }
    }
    return val
}


const resultMapper = async (val,params) => {
    val = await parse2JsonObject(val,params)
    if(!params.original){
        val = await referencedObjectMapper(val,params)
    }
    return val
}

const responseMapper = async (val, params, ctx) => {
    let results = []
    if (_.isArray(val)) {
        for(let single of val){
            results.push(await resultMapper(single,params))
        }
        val = results
    }else{
        val = await resultMapper(val,params)
    }
    return val
}


module.exports = {responseMapper}

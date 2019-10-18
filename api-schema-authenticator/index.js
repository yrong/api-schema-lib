const common = require('api-schema-common')
const ScirichonError = common.ScirichonError
const Redis = require('redis')
const Acl = require('acl-fork')
const _ = require('lodash')

const isSearchRequest = (ctx) => {
    const searchUrlPattern = common.getConfigWithDefaultValue('auth.searchUrlPattern',"\\/api\\/?.*\\/search|\\/api\\/members/")
    const searchUrlExp = new RegExp(searchUrlPattern,"i")
    if (ctx.method === 'GET') {
        return true
    } else if(ctx.path.match(searchUrlExp)){
        return true
    }
    return false
}

const needCheck = (ctx)=>{
    const tokenHeader = common.getConfigWithDefaultValue('auth.tokenFieldName','token')
    const internalToken = common.getConfigWithDefaultValue('auth.internalUsedToken','qwe!@#')
    const ignoredUrlPattern = common.getConfigWithDefaultValue('auth.ignoredUrlPattern',"\\/no_auth|\\/hidden")
    const apiUrlPattern = common.getConfigWithDefaultValue('auth.apiUrlPattern',"\\/api")
    if(ctx.headers[tokenHeader]===internalToken){
        return false
    }
    const ignoredUrlExp = new RegExp(ignoredUrlPattern,"i")
    if(ctx.path.match(ignoredUrlExp)){
        return false
    }
    const apiUrlExp = new RegExp(apiUrlPattern,"i");
    if(ctx.path.match(apiUrlExp)){
        return true
    }
    return false
}

const checkAcl = (option) => {
    const redisClient = Redis.createClient(_.assign({db: 2}, option.redisOption));
    const acl = new Acl(new Acl.redisBackend(redisClient, 'acl'))
    return async (ctx, next) => {
        if (needCheck(ctx)) {
            let hasRight, own, User = common.getConfigWithDefaultValue('auth.userFieldName','token_user'),
                user = ctx[User], name = user && user.name, roles = user && user.roles,
                exception_msg, promise
            promise = new Promise((resolve, reject) => {
                if (isSearchRequest(ctx)) {
                    resolve(true)
                } else {
                    if (_.isEmpty(user)) {
                        throw new ScirichonError(`token user not found`, 401)
                    }
                    if (_.isEmpty(roles)) {
                        throw new ScirichonError(`user ${name} without role not allowed`, 401)
                    }
                    exception_msg = `user ${name} with roles ${roles} can not create/update/delete resource`
                    acl.isAllowed(user.uuid, '*', 'UPDATE', async function (err, res) {
                        if (!res) {
                            reject(new ScirichonError(exception_msg, 401))
                        } else {
                            resolve(true)
                        }
                    })
                }
            })
            hasRight = await Promise.resolve(promise)
            if (hasRight === true) {
                await next()
            } else {
                ctx.throw(`user ${name} with role ${roles} check right failed`, 401)
            }
        } else {
            await next()
        }
    }
}

const checkToken = (options) => {
    if (!options.check_token_url) {
        throw new Error('missing auth_url')
    }
    return async function (ctx, next) {
        if (needCheck(ctx)) {
            let token, result, passport, Token = common.getConfigWithDefaultValue('auth.tokenFieldName','token')
                , User = common.getConfigWithDefaultValue('auth.userFieldName','token_user'), error_msg
            token = (ctx.request.body && ctx.request.body[Token])
                || ctx.query[Token]
                || ctx.req.headers[Token]
            if (!token) {
                throw new ScirichonError('no token found in request', 401)
            }
            try {
                result = await common.apiInvoker('POST', options.check_token_url, '', '', {token}, {token})
            } catch (error) {
                if (error && error.error && error.error.message && error.error.message.content) {
                    error_msg = error.error.message.content
                } else {
                    error_msg = error.message
                }
                throw new ScirichonError(`check token from auth failed,${error_msg}`, 401)
            }
            passport = result.data || result
            if (_.isEmpty(passport)) {
                throw new ScirichonError('no passport found in auth response', 401)
            } else {
                ctx[Token] = token
                ctx[User] = passport.local || passport.ldap
            }
            await next()
        } else {
            await next()
        }
    }
}

module.exports = {checkToken,checkAcl}

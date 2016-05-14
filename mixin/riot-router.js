"use strict";
import riot from 'riot';

var hub = riot.observable();

hub.routesMap = {};

hub.defaultRoute = null;

hub.init = function(){
    hub._parseRoute();
    riot.route.start();
    riot.route(hub._doRoute());
    nextTick(riot.route.exec, 0);
    function nextTick(fn){
        setTimeout(fn, 0);
    }
};

hub._parseRoute = function(){
    riot.route.parser(function(path){
        let req = {};
        let [uri, queryString] = path.split('?');
        let uriParts = uri.split('/');

        req.params = {};
        req.paramList = [];
        if(uri.match(/_(\w+)/g)){
            req.paramList = uriParts.filter(p => p.match(/_(\w+)/g)).map(o => o.slice(1));
        }

        req.query = {};
        if(queryString){
            queryString.split('&').map(i=>req.query[i.split('=')[0]] = i.split('=')[1]);
        }

        req.hints = [];
        if(uriParts.length){
            req.hints = uriParts.map((i, index)=>{
                if(index === 0){
                    return i;
                }
                return combineUriParts(uriParts, index, i);
            });
        }
        return req;
    });
    function combineUriParts(parts, i, combined){
        if(!parts.length || i<=0){
            return combined;
        }
        let uri = parts[i-1] + '/' + combined;
        return combineUriParts(parts, --i, uri);
    }
};

hub.registerRoute = function({path, name, before}, container){
    hub.routesMap[path] = {
        before,
        tag: container.tags[name]};
    return this;
};

hub._doRoute = function(){
    return req => {
        let me = this;
        let isFounded = false;
        function recursiveHints(hints){
            if(!hints.length){
                return;
            }
            let path = hints[0];
            let request = {};
            let {route, params} = me._getMetaDataFromRouteMap(path);

            if(!route){
                return recursiveHints(hints.slice(1));
            }
            let tag = route.tag;
            isFounded = true;
            request.params = params;
            request.query = req.query;
            let ctx = {
                request
            };
            if(route.before){
                route.before.apply(tag, [done]);
                return;
            }
            done();
            function done(){
                if(tag.hasOwnProperty('hidden') && tag.hidden){
                    tag.one('ready', ()=>{
                        hub._routeTo(tag);
                    recursiveHints(hints.slice(1));
                });
                    tag.trigger('open', ctx);
                    return;
                }
                recursiveHints(hints.slice(1));
            }
        }
        recursiveHints(req.hints);
        if(!isFounded){
            let url = hub.defaultRoute.path;
            let paramsParts = url.match(/_[a-zA-Z0-9:]+/g);
            if(paramsParts && paramsParts.length){
                paramsParts.map(part=>{
                    let key = part.slice(2);
                let value = hub.defaultRoute.defaultRoute.params
                    && hub.defaultRoute.defaultRoute.params[key]
                    || "";
                url = url.replace(new RegExp('_:' + key + '+'), '_' + value);
            });
            }
            riot.route('/' + url);
        }
    };
};

hub._routeTo = function(tag){
    tag.hidden = !tag.hidden;
    tag.update();
    Object.keys(tag.parent.tags)
        .map(k=>tag.parent.tags[k])
        .filter(t=>t!=tag)
        .forEach(t=>{
            if(tag.hasOwnProperty('hidden')){
            t.hidden = true;
            t.update();
        }
});
};

hub._getMetaDataFromRouteMap = function(routeKey){
    routeKey = '/' + routeKey;
    let keys = Object.keys(this.routesMap);
    for(let i=0, len=keys.length; i<len; i++){
        let k = keys[i];
        let route = this.routesMap[k];
        if(toPattern(k) === toPattern(routeKey)){
            let paramKeys = (extractParams(k) || []).map(i=>i.slice(2));
            let paramValues = (extractParams(routeKey) || []).map(i=>i.slice(1));
            return {
                route,
                params: _.object(paramKeys, paramValues)
            };
        }
    }
    return {
        tag: null,
        params: null
    };
    function extractParams(path){
        return path.match(/_[a-zA-Z0-9:]+/g);
    }
    function toPattern(route){
        return route.replace(/_[a-zA-Z0-9:]+/g, "*");
    }
};

hub.init();

export var router = {
    defaultRoute: null,

    prefixPath: '',

    routesMap: null,

    _registerRoute: function({path, name, before}, container){
        let me = this;
        if(!me.routesMap){
            me.routesMap = {};
        }
        me.routesMap[path] = {
            name,
            before,
            tag: container.tags[name]};
        hub.registerRoute({path: me.prefixPath + path, name, before}, container);
        return this;
    },

    prefix: function(prefix){
        this.prefixPath = prefix;
        return this;
    },

    routeConfig: function(routes){
        if(!this.prefixPath && this.parent && this.parent.routesMap){
            this.prefixPath = (this.parent.prefixPath || '') + getPrefix(this);
        }
        routes.forEach(route=>{
            if(route.defaultRoute){
            hub.defaultRoute = route;
        }
        this._registerRoute(route, this);
    });
        function getPrefix(tag){
            let returnPath = '';
            Object.keys(tag.parent.routesMap).forEach(path=>{
                let route = tag.parent.routesMap[path];
            if(route.name === getTagName(tag)){
                returnPath = path
            }
        });
            return returnPath;
        }
        function getTagName(tag){
            return tag.root.localName;
        }
    }
};
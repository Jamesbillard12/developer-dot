const buildQsPath = (queryString, example = false) => {
    let qsPath = '';
    let addedQsParamCount = 0;

    if (example) {
        if (queryString && Object.keys(queryString)) {
            qsPath = Object.keys(queryString).reduce((qs, param) => (`${qs}${addedQsParamCount++ > 0 ? '&' : ''}${param}=${queryString[param]}`), '?');
        }
    } else if (queryString && Object.keys(queryString).some((p) => queryString[p] && queryString[p].value)) {
        qsPath = Object.keys(queryString).reduce((qs, param) => (queryString[param].value ? `${qs}${addedQsParamCount++ > 0 ? '&' : ''}${param}=${queryString[param].value}` : qs), '?');
    }

    return qsPath;
};

const buildPostBodyData = (body) => {
    if (body === undefined) {
        return body;
    }
    if (body.hasOwnProperty('value') && body.fieldType !== 'array') {
        return body.value;
    }

    if (body.fieldType === 'array') {
        const arrayBody = body.value.reduce((accum, prop) => {
            if (prop && prop.hasOwnProperty('value') && prop.value === '') {
                return accum;
            }
            return accum.concat(buildPostBodyData(prop));
        }, []);

        return arrayBody.length ? arrayBody : undefined;
    }
    const objBody = Object.keys(body).filter((n) => n !== 'uiState').reduce((accum, propName) => {
        if (body[propName] && body[propName].hasOwnProperty('value') && body[propName].value === '') {
            return accum;
        }

        return {...accum, [propName]: buildPostBodyData(body[propName])};
    }, {});

    return Object.keys(objBody).length ? objBody : undefined;
};

const replacePathParams = (path, pathParams, example = false) => {
    let newPath = path;

    if (example) {
        if (pathParams && Object.keys(pathParams)) {
            Object.keys(pathParams).forEach((key) => {
                newPath = newPath.replace(`{${key}}`, pathParams[key]);
            });
        }
    } else if (pathParams && Object.keys(pathParams).some((k) => pathParams[k].value)) {
        Object.keys(pathParams).forEach((key) => {
            // Replace all path param placeholders with their values, only if it's non-empty/null
            if (pathParams[key].value) {
                newPath = newPath.replace(`{${key}}`, pathParams[key].value);
            }
        });
    }
    return newPath;
};

const buildCurl = (auth, endpoint) => {
    const endpointPath = replacePathParams(endpoint.path, endpoint.pathParams);

    let curl = `curl -X ${endpoint.action.toUpperCase()} "${endpointPath}${endpoint.qsPath || ''}" -H "Accept: application/json"`;

    if (auth) {
        curl += ' -H "Authorization: <YOUR_AUTH_INFO_HERE>"';
    }

    if (endpoint.postBodyData) {
        curl += ` -H "Content-Type: application/json" --data '${JSON.stringify(endpoint.postBodyData)}'`;
    }
    return curl;
};

const fillOrRemoveRequestParamSampleData = (params, remove) => {
    if (remove) {
        return Object.keys(params).reduce((accum, pName) => {
            accum[pName] = {...params[pName], value: ''};
            return accum;
        }, {});
    }

    return Object.keys(params).reduce((newParams, paramName) => {
        if (params[paramName].example) {
            newParams[paramName] = {...params[paramName], value: params[paramName].example};
        } else {
            newParams[paramName] = params[paramName];
        }

        return newParams;
    }, {});
};

const removePostBodyValues = (postBody) => {
    if (postBody === undefined) {
        return postBody;
    }
    if (postBody.hasOwnProperty('value') && postBody.fieldType !== 'array') {
        return {...postBody, value: ''};
    }

    if (postBody.fieldType === 'array') {
        const arrayBody = postBody.value.reduce((accum, prop) => {
            if (prop && prop.hasOwnProperty('value')) {
                return accum.concat({...prop, value: ''});
            }
            return accum.concat(removePostBodyValues(prop));
        }, []);

        return {...postBody, value: arrayBody};
    }

    if (postBody.hasOwnProperty('visible')) {
        return {...postBody, visible: true};
    }

    return Object.keys(postBody).reduce((accum, propName) => {
        return {...accum, [propName]: removePostBodyValues(postBody[propName])};
    }, {});
};

const fillPostBodySampleData = (postBody) => {
    if (postBody === undefined) {
        return postBody;
    }
    if (postBody.hasOwnProperty('value') && postBody.fieldType !== 'array') {
        return {...postBody, value: postBody.example || ''};
    }

    if (postBody.fieldType === 'array') {
        const arrayBody = postBody.value.reduce((accum, prop) => {
            if (prop && prop.hasOwnProperty('value')) {
                return accum.concat({...prop, value: (prop.example || '')});
            }
            return accum.concat(fillPostBodySampleData(prop));
        }, []);

        return {...postBody, value: arrayBody};
    }

    if (postBody.hasOwnProperty('visible')) {
        return {...postBody, visible: true};
    }

    return Object.keys(postBody).reduce((accum, propName) => {
        return {...accum, [propName]: fillPostBodySampleData(postBody[propName])};
    }, {});
};

const fillOrRemoveSampleData = (endpointState, remove = false) => {
    if (endpointState.queryString) {
        endpointState.queryString = fillOrRemoveRequestParamSampleData(endpointState.queryString, remove);
    }

    if (endpointState.pathParams) {
        endpointState.pathParams = fillOrRemoveRequestParamSampleData(endpointState.pathParams, remove);
    }

    if (endpointState.postBody) {
        endpointState.postBody = remove ? removePostBodyValues(endpointState.postBody) : fillPostBodySampleData(endpointState.postBody);
    }

    return endpointState;
};

// Returns a bool if no example data exists at any point in the schema of the Post Body, Query String or Path Param
const hasExampleData = (type, paramObj = {}) => {
    if (type !== 'QUERY_STRING' && type !== 'POST_BODY' && type !== 'PATH_PARAM') {
        throw new Error('helpers.hasExampleData error: Did not recognize `type` ' + type);
    }

    // For a QueryString or PathParam, there's no nested props, so we can determine
    // existence of an example value by just searching through `paramObj`'s keys
    if (type === 'QUERY_STRING' || type === 'PATH_PARAM') {
        return Object.keys(paramObj).some((param) => paramObj[param].example);
    }

    // At this point, object must be a PostBody

    // If `paramObj` is a primitive type -- string, number, etc. -- can immediately return
    if (paramObj.fieldType && paramObj.fieldType !== 'array') {
        return paramObj.hasOwnProperty('example') && paramObj.example !== '';
    }

    // Dealing with an arbitrarily-nested PostBody of type Array or Object now
    // Recurse on either the collection.items or the Object properties

    if (paramObj.fieldType && paramObj.fieldType === 'array') {
        return hasExampleData('POST_BODY', paramObj.items);
    }

    return Object.keys(paramObj).filter((k) => k !== 'uiState').map((itm) => hasExampleData('POST_BODY', paramObj[itm])).some((wasTrue) => wasTrue);
};

const buildAuth = (authFormula) => {
    // Grab all auth variables out of authFormula str (should be in <> brackets)
    let auth;

    if (!authFormula) {
        auth = null;
    } else {
        const authParams = authFormula.match(/<\w+>/g).map((key) => key.substring(1, key.length - 1)).reduce((accum, key) => (
                {...accum, [key]: ''}
        ), {});

        auth = {
            formula: authFormula,
            params: authParams
        };
    }

    return auth;
};

const buildPostmanCollection = (appState) => {
    const postmanCollection = {
        /* eslint-disable camelcase */
        info: {
            name: appState.apiName,
            _postman_id: '1234',
            description: appState.apiDescription,
            schema: 'https://schema.getpostman.com/json/collection/v2.0.0/collection.json'
        }
        /* eslint-enable camelcase */
    };

    // NOTE: For GETS w/ query or path params, no raw data -- need to replace in the URL

    postmanCollection.item = appState.apiInfo.map((endpoint) => {
        const baseRequest = {
            name: endpoint.name,
            request: {
                url: endpoint.path,
                method: endpoint.action,
                header: [],
                description: endpoint.description
            },
            response: []
        };

        if (endpoint.postBody) {
            baseRequest.request.header.push({
                key: 'Content-Type',
                value: 'application/json'
            });
            baseRequest.request.body = {
                mode: 'raw',
                raw: JSON.stringify(buildPostBodyData(fillPostBodySampleData(endpoint.postBody)))
            };
        } else {
            baseRequest.request.body = {
                mode: 'formdata',
                formdata: []
            };
        }

        if (endpoint.pathParams) {
            baseRequest.request.url = replacePathParams(endpoint.path, fillOrRemoveRequestParamSampleData(endpoint.pathParams));
        }

        if (endpoint.queryString) {
            baseRequest.request.url += buildQsPath(fillOrRemoveRequestParamSampleData(endpoint.queryString));
        }

        return baseRequest;
    });

    return postmanCollection;
};

const replaceSpacesInStr = (str) => str.replace(/\s/g, '_');

export {buildQsPath, buildPostBodyData, buildCurl, replacePathParams, fillOrRemoveSampleData, hasExampleData, buildPostmanCollection, buildAuth, replaceSpacesInStr};
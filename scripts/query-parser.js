// scripts/query-parser.js
(function () {

    /***********************************************
     * 1. EXTRACT QUERY FROM PAYLOAD
     ***********************************************/
    function extractESQuery(payload) {
        if (!payload || typeof payload !== 'object') return null;

        if (payload.searchParams) {
            return { _sydleNative: true, searchParams: payload.searchParams };
        }

        if (payload.query) return payload.query;
        if (payload.variables?.query) return payload.variables.query;

        function deepSearch(obj) {
            if (!obj || typeof obj !== 'object') return null;
            if (obj.bool || obj.match || obj.term || obj.terms || obj.range) return obj;
            for (let k in obj) {
                if (typeof obj[k] === 'object') {
                    const found = deepSearch(obj[k]);
                    if (found) return found;
                }
            }
            return null;
        }
        return deepSearch(payload);
    }

    /***********************************************
     * 2. FILTER NORMALIZATION
     ***********************************************/

    // Resolve SYDLE relative-date value objects into ES date-math strings.
    // Returns the value unchanged if it is not a recognized relative-date shape.
    function resolveRelativeDate(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return value;

        const type = ((value.type || value.relative || '')).toString().toUpperCase();
        const qty  = value.days || value.value || value.amount || 0;

        switch (type) {
            case 'LAST_DAYS':
            case 'LAST':       return `now-${qty}d/d`;
            case 'NEXT_DAYS':
            case 'NEXT':       return `now+${qty}d/d`;
            case 'TODAY':      return 'now/d';
            case 'YESTERDAY':  return 'now-1d/d';
            case 'TOMORROW':   return 'now+1d/d';
            case 'THIS_WEEK':  return { gte: 'now/w', lte: 'now/w' };
            case 'THIS_MONTH': return { gte: 'now/M', lte: 'now/M' };
            default:           return value;
        }
    }

    // Extract all structural metadata from a raw SYDLE filter object and produce
    // a normalized descriptor that every clause builder can use uniformly.
    function normalizeFilter(filter) {
        const field     = filter.field || {};
        const fieldPath = field.fieldPath || '';
        const operator  = (filter.operator || '=').trim();
        const rawValue  = filter.value;

        // concreteFields hint — accept both array and object shapes
        let concreteFields = {};
        const rawCF = field.concreteFields;
        if (Array.isArray(rawCF)) {
            rawCF.forEach(cf => {
                const fp = (cf.fieldPath || cf.field || '').toString();
                if      (fp.endsWith('.keyword'))     concreteFields.keyword     = fp;
                else if (fp.endsWith('.normalized'))  concreteFields.normalized  = fp;
                else if (fp.endsWith('.autocomplete')) concreteFields.autocomplete = fp;
                else if (fp.endsWith('.exact'))       concreteFields.exact       = fp;
                else if (fp.endsWith('.raw'))         concreteFields.raw         = fp;
            });
        } else if (rawCF && typeof rawCF === 'object') {
            concreteFields = { ...rawCF };
        }

        // Field type lives at field.option.data.type ("STRING", "DATE", "NUMBER", "REFERENCE", …)
        const fieldType  = field.option?.data?.type || field.fieldType || null;
        const isMultiple = !!field.isMultiple;
        const isEmbedded = !!field.isEmbedded;

        // Reference detection — value is an object with ._id (or array of such)
        let isReference    = false;
        let effectiveValue = rawValue;

        if (Array.isArray(rawValue)) {
            const hasRef = rawValue.some(v => v && typeof v === 'object' && v._id);
            if (hasRef) {
                isReference    = true;
                effectiveValue = rawValue.map(v => (v && typeof v === 'object') ? v._id : v);
            }
        } else if (rawValue && typeof rawValue === 'object' && rawValue._id) {
            isReference    = true;
            effectiveValue = rawValue._id;
        } else if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)
                   && Object.keys(rawValue).length === 0) {
            effectiveValue = null;
        }

        // Relative date resolution (non-reference, non-array only)
        if (!isReference && !Array.isArray(effectiveValue)) {
            effectiveValue = resolveRelativeDate(effectiveValue);
        }

        // additionalData field path resolution.
        // SYDLE internal paths like "6144f9114a1c697282b996fb.:ProgramAdditionalData:selectionForm"
        // map to "additionalData._concreteFields.selectionForm" in Elasticsearch.
        const isAdditionalData = fieldPath.includes('.:');
        let resolvedPath = fieldPath;
        if (isAdditionalData) {
            const segments    = fieldPath.split(':');
            const esFieldName = segments[segments.length - 1];
            resolvedPath = `additionalData._concreteFields.${esFieldName}`;
        }

        // Effective ES field
        const TERM_OPS = ['=', '==', '!=', 'in', 'IN', 'not in', 'NOT_IN'];
        let effectiveField = resolvedPath;

        if (isReference) {
            effectiveField = `${resolvedPath}._id`;
        } else if (!isAdditionalData && concreteFields.keyword && TERM_OPS.includes(operator)) {
            effectiveField = concreteFields.keyword;
        }

        // Nested path: only when field is both multiple AND embedded
        let nestedPath = null;
        if (isMultiple && isEmbedded) {
            nestedPath = resolvedPath.includes('.')
                ? resolvedPath.split('.').slice(0, -1).join('.')
                : resolvedPath;
        }

        return {
            fieldPath,
            operator,
            effectiveField,
            effectiveValue,
            isReference,
            isMultiple,
            isEmbedded,
            isAdditionalData,
            fieldType,
            concreteFields,
            nestedPath
        };
    }

    /***********************************************
     * 3. SINGLE FILTER → ES CLAUSE
     ***********************************************/

    // Low-level builder — called with already-resolved field and value.
    function buildESClause(field, operator, value) {
        switch (operator) {
            case '=':
            case '==':
                if (value === null || value === '') {
                    return { bool: { must_not: [{ exists: { field } }] } };
                }
                // resolveRelativeDate may return a range-shape object (e.g. THIS_WEEK)
                if (value && typeof value === 'object' && !Array.isArray(value)
                    && (value.gte !== undefined || value.lte !== undefined
                        || value.gt !== undefined || value.lt !== undefined)) {
                    return { range: { [field]: value } };
                }
                return { term: { [field]: value } };

            case '!=':
                if (value === null || value === '') return { exists: { field } };
                return { bool: { must_not: [{ term: { [field]: value } }] } };

            case '>':  return { range: { [field]: { gt:  value } } };
            case '>=': return { range: { [field]: { gte: value } } };
            case '<':  return { range: { [field]: { lt:  value } } };
            case '<=': return { range: { [field]: { lte: value } } };

            case 'CONTAINS':
                return { wildcard: { [field]: { value: `*${value}*`, case_insensitive: true } } };

            case 'IN':
                return { terms: { [field]: Array.isArray(value) ? value : [value] } };

            case 'NOT_IN':
                return { bool: { must_not: [{ terms: { [field]: Array.isArray(value) ? value : [value] } }] } };

            case 'EMPTY':
                return { bool: { must_not: [{ exists: { field } }] } };

            case 'NOT_EMPTY':
                return { exists: { field } };

            // Relative date operators — value is the number of days
            case 'LAST_DAYS':
                return { range: { [field]: { gte: `now-${value}d/d` } } };
            case 'NEXT_DAYS':
                return { range: { [field]: { lte: `now+${value}d/d` } } };

            default:
                return { term: { [field]: value } };
        }
    }

    function filterToESClause(filter) {
        const norm = normalizeFilter(filter);
        const { fieldPath, operator, effectiveField, effectiveValue, nestedPath } = norm;
        if (!fieldPath) return null;

        const clause = buildESClause(effectiveField, operator, effectiveValue);
        if (!clause) return null;

        if (nestedPath) {
            return { nested: { path: nestedPath, query: clause } };
        }
        return clause;
    }

    /***********************************************
     * 4. FORMAT: ELASTICSEARCH QUERY
     ***********************************************/
    function toElasticsearch(input) {
        if (!input) return null;
        // Already a plain ES query (intercepted from a non-searchParams request)
        if (!input._sydleNative && input.filters === undefined && input.searchText === undefined) return input;
        return toElasticsearchFromSearchParams(input._sydleNative ? input.searchParams : input);
    }

    function toElasticsearchFromSearchParams(searchParams) {
        if (!searchParams) return null;
        const filters = (searchParams.filters || []).filter(f => !f.disabled);

        const clauses = [];
        if (searchParams.searchText) {
            clauses.push({ multi_match: { query: searchParams.searchText, type: 'best_fields' } });
        }
        filters.forEach(f => {
            const clause = filterToESClause(f);
            if (clause) clauses.push(clause);
        });

        if (clauses.length === 0) return null;
        if (clauses.length === 1) return clauses[0];
        return { bool: { must: clauses } };
    }

    /***********************************************
     * 5. SORT EXTRACTION & CONVERSION
     ***********************************************/
    const SORT_KEYS = ['sort', 'sorters', 'sorts', 'sortBy', 'orderBy', 'sorting', 'order'];

    // Find the raw sort definition. searchParams wins over the outer payload.
    function extractSort(payload) {
        if (!payload || typeof payload !== 'object') return null;

        const candidates = [
            payload.searchParams,
            payload.getCardsOptions?.searchParams,
            payload.getCardsOptions,
            payload,
            payload.variables
        ];
        for (const obj of candidates) {
            if (!obj || typeof obj !== 'object') continue;
            for (const k of SORT_KEYS) {
                const v = obj[k];
                if (v == null || v === '') continue;
                if (Array.isArray(v) && v.length === 0) continue;
                // 'order' alone is too generic — only accept it when it looks like a sort
                if (k === 'order' && typeof v !== 'object') continue;
                return v;
            }
        }
        return null;
    }

    function normalizeDirection(item) {
        const raw = item.direction ?? item.order ?? item.sortOrder ?? item.sortDirection
                 ?? item.dir ?? item.type ?? (item.asc === false || item.descending === true ? 'desc' : 'asc');
        const d = String(raw).toLowerCase();
        return (d.startsWith('desc') || d === '-1') ? 'desc' : 'asc';
    }

    // Resolve the ES field for sorting (keyword sub-field for text, additionalData mapping, nested path).
    function resolveSortField(fieldDef) {
        if (typeof fieldDef === 'string') return { field: fieldDef, nestedPath: null };

        const norm = normalizeFilter({ field: fieldDef, operator: 'SORT' });
        let field = norm.fieldPath;
        if (norm.isAdditionalData) {
            field = `additionalData._concreteFields.${field.split(':').pop()}`;
        }
        if (norm.concreteFields.keyword && !norm.isAdditionalData) {
            field = norm.concreteFields.keyword;
        }
        return { field, nestedPath: norm.nestedPath };
    }

    function sortItemToES(item) {
        if (item == null) return null;

        // "name" / "-name"
        if (typeof item === 'string') {
            return item.startsWith('-')
                ? { [item.slice(1)]: { order: 'desc' } }
                : { [item]: { order: 'asc' } };
        }
        if (typeof item !== 'object') return null;

        const fieldDef = item.field ?? item.fieldPath ?? item.property ?? item.path ?? item.key ?? item.name;
        if (fieldDef == null) {
            // Already ES-shaped: { field: 'asc' } or { field: { order: 'desc' } }
            return Object.keys(item).length ? item : null;
        }

        const { field, nestedPath } = resolveSortField(fieldDef);
        if (!field) return null;

        const spec = { order: normalizeDirection(item) };
        if (nestedPath) spec.nested = { path: nestedPath };
        return { [field]: spec };
    }

    function toElasticsearchSort(rawSort) {
        if (!rawSort) return null;
        const items = Array.isArray(rawSort) ? rawSort : [rawSort];
        const sort = items.map(sortItemToES).filter(Boolean);
        return sort.length ? sort : null;
    }

    /***********************************************
     * 6. PUBLIC API
     ***********************************************/
    window.SydleQueryParser = {
        extractESQuery,
        toElasticsearch,
        extractSort,
        toElasticsearchSort,
        // Exposed for debugging / advanced use
        normalizeFilter,
        buildESClause,
        resolveRelativeDate
    };

})();

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const user = (id = 'A', extra = {}) => ({ id, email: `${id.toLowerCase()}@example.test`, dni: `DOC-${id}`,
    password: `hash:pass-${id}`, rol: 'estudiante', estado_aprobacion: 'aprobado', nombre_completo: `Usuario ${id}`, ...extra });
const storage = (values = new Map()) => ({ getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key), values });
const deferred = () => {
    let resolve;
    const promise = new Promise(ok => { resolve = ok; });
    return { promise, resolve };
};
const flush = async () => { for (let index = 0; index < 15; index++) await Promise.resolve(); };

function environment(options = {}) {
    const events = {};
    const navigation = [];
    let now = 100000;
    const context = {
        localStorage: storage(options.local), sessionStorage: storage(options.session),
        Date: class extends Date { static now() { return now; } },
        location: { replace: url => navigation.push(url), assign: url => navigation.push(url) },
        addEventListener: (event, callback) => { events[event] = callback; }
    };
    context.window = context;
    vm.createContext(context);
    const load = filename => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', filename), 'utf8'), context);
    return { context, events, navigation, load, advance: ms => { now += ms; } };
}

function database(rows, options = {}) {
    const calls = [];
    return {
        calls,
        from(table) {
            const call = { table, filters: [] };
            calls.push(call);
            const query = {
                select: fields => { call.fields = fields; return query; },
                eq: (field, value) => { call.filters.push([field, value]); return query; },
                limit: async limit => {
                    call.limit = limit;
                    if (options.respond) return options.respond(call);
                    if (options.error) return { data: null, error: { message: 'offline' } };
                    const matches = rows.filter(row => call.filters.every(([field, value]) => row[field] === value));
                    return { data: matches.slice(0, limit), error: null };
                }
            };
            return query;
        }
    };
}

module.exports = { user, storage, deferred, flush, environment, database };

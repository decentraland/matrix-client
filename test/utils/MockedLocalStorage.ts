export function localStorageMock(): Storage {
    let storage = { };

    return {
        clear() {
            Object.keys(storage)
                .forEach(key => this.removeItem(key))
        },
        setItem: function(key: string, value: string) {
            storage[key] = value || '';
        },
        getItem: function(key: string) {
            return key in storage ? storage[key] : null;
        },
        removeItem: function(key: string) {
            delete storage[key];
        },
        get length() {
            return Object.keys(storage).length;
        },
        key: function(i) {
            const keys = Object.keys(storage);
            return keys[i] || null;
        }
    };
}
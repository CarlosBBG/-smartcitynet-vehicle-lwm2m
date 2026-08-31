module.exports = {
    uiPort: process.env.NODE_RED_PORT || 1880,
    uiHost: process.env.NODE_RED_HOST || "127.0.0.1",
    flowFile: "flows.json",
    credentialSecret: false,
    editorTheme: {
        projects: { enabled: false }
    },
    logging: {
        console: {
            level: "info",
            metrics: false,
            audit: false
        }
    }
};

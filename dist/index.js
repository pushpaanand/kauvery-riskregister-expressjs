"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: '.env.local' });
dotenv_1.default.config({ path: '.env' });
dotenv_1.default.config({ path: '../.env.local' });
dotenv_1.default.config({ path: '../.env' });
dotenv_1.default.config({ path: '../../.env.local' });
dotenv_1.default.config({ path: '../../.env' });
const ai_1 = __importDefault(require("./routes/ai"));
const auth_1 = __importDefault(require("./routes/auth"));
const departments_1 = __importDefault(require("./routes/departments"));
const incidents_1 = __importDefault(require("./routes/incidents"));
const notifications_1 = __importDefault(require("./routes/notifications"));
const risks_1 = __importDefault(require("./routes/risks"));
const users_1 = __importDefault(require("./routes/users"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/ai', ai_1.default);
app.use('/api/auth', auth_1.default);
app.use('/api/departments', departments_1.default);
app.use('/api/incidents', incidents_1.default);
app.use('/api/notifications', notifications_1.default);
app.use('/api/risks', risks_1.default);
app.use('/api/users', users_1.default);
const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Express API listening on http://localhost:${port}`);
});

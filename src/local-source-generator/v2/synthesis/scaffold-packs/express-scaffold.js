/**
 * Express Scaffold Pack - Framework-specific templates for Express.js
 */

export const EXPRESS_SCAFFOLD = {
  name: 'express',
  framework: 'Express.js',
  language: 'javascript',

  /**
   * Project structure template
   */
  structure: {
    'package.json': 'package',
    'app.js': 'app',
    'routes/index.js': 'routes_index',
    'routes/api.js': 'routes_api',
    'middleware/auth.js': 'middleware_auth',
    'middleware/error.js': 'middleware_error',
    'models/index.js': 'models_index',
    'controllers/index.js': 'controllers_index',
    'config/index.js': 'config',
    'eslint.config.js': 'eslint_config',
  },

  /**
   * Templates
   */
  templates: {
    package: (config) => `{
  "name": "${config.name || 'generated-api'}",
  "version": "1.0.0",
  "description": "Auto-generated Express API from LSG v2",
  "main": "app.js",
  "scripts": {
    "start": "node app.js",
    "dev": "nodemon app.js",
    "test": "jest"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "morgan": "^1.10.0",
    "dotenv": "^16.3.1"${config.auth?.mechanism === 'jwt' ? ',\n    "jsonwebtoken": "^9.0.2",\n    "bcryptjs": "^2.4.3"' : ''}
  },
  "devDependencies": {
    "nodemon": "^3.0.2",
    "jest": "^29.7.0",
    "supertest": "^6.3.3",
    "globals": "^15.0.0"
  },
  "lsg_generated": true,
  "lsg_version": "2.0.0"
}`,

    app: (config) => `/**
 * Express Application - LSG v2 Generated
 * 
 * Generated from TargetModel with ${config.endpoints?.length || 0} endpoints
 * Epistemic confidence: ${(config.epistemic?.overall_opinion?.b || 0).toFixed(2)}
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const apiRoutes = require('./routes/api');
const errorHandler = require('./middleware/error');

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api', apiRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', generated: 'lsg-v2' });
});

// Error handling
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});

module.exports = app;
`,

    routes_api: (config) => {
      const routes = config.endpoints || [];
      let routeHandlers = routes.map(ep => {
        const method = (ep.method || 'get').toLowerCase();
        const path = ep.path || '/';
        const handler = generateHandler(ep);
        return `
// ${ep.description || `${method.toUpperCase()} ${path}`}
// Evidence: ${ep.evidence_refs?.length || 0} sources
// Confidence: ${(ep.confidence || 0.5).toFixed(2)}
router.${method}('${path}', ${handler});`;
      }).join('\n');

      return `/**
 * API Routes - LSG v2 Generated
 */

const express = require('express');
const router = express.Router();
${config.auth?.mechanism === 'jwt' ? "const { authenticate } = require('../middleware/auth');" : ''}

${routeHandlers}

module.exports = router;
`;
    },

    routes_index: () => `/**
 * Routes Index - LSG v2 Generated
 */

const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json({ message: 'API is running' });
});

module.exports = router;
`,

    middleware_auth: (config) => {
      if (config.auth?.mechanism === 'jwt') {
        return `/**
 * JWT Authentication Middleware - LSG v2 Generated
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

function authenticate(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

module.exports = { authenticate, generateToken };
`;
      }

      return `/**
 * Authentication Middleware Stub - LSG v2 Generated
 * 
 * Auth mechanism: ${config.auth?.mechanism || 'unknown'}
 * Note: Implementation details inferred, may need adjustment
 */

function authenticate(req, res, next) {
  // TODO: Implement authentication based on observed patterns
  // Detected mechanism: ${config.auth?.mechanism || 'unknown'}
  next();
}

module.exports = { authenticate };
`;
    },

    middleware_error: () => `/**
 * Error Handler Middleware - LSG v2 Generated
 */

function errorHandler(err, req, res, next) {
  console.error(err.stack);
  
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';
  
  res.status(status).json({
    error: {
      message,
      status,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
}

module.exports = errorHandler;
`,

    models_index: (config) => {
      const models = config.models || [];
      return `/**
 * Models Index - LSG v2 Generated
 * 
 * Inferred models: ${models.length}
 */

${models.map(m => `
// ${m.name}
// Fields: ${Object.keys(m.fields || {}).join(', ')}
class ${m.name} {
  constructor(data) {
    ${Object.entries(m.fields || {}).map(([k, v]) => `this.${k} = data.${k};`).join('\n    ')}
  }
}
`).join('\n')}

module.exports = { ${models.map(m => m.name).join(', ')} };
`;
    },

    controllers_index: () => `/**
 * Controllers Index - LSG v2 Generated
 */

// Controller logic should be extracted from route handlers
// for production use

module.exports = {};
`,

    config: () => `/**
 * Configuration - LSG v2 Generated
 */

module.exports = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'change-in-production',
};
`,

    eslint_config: () => `/**
 * ESLint Configuration - LSG v2 Generated
 */

const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
    js.configs.recommended,
    {
        files: ["**/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "commonjs",
            globals: {
                ...globals.node,
                ...globals.jest
            }
        },
        rules: {
            "no-unused-vars": "warn",
            "no-console": "off",
            "no-undef": "error"
        }
    }
];
`,
  },
};

/**
 * Generate route handler code
 */
function generateHandler(endpoint) {
  const method = (endpoint.method || 'GET').toUpperCase();
  const params = endpoint.params || [];

  const queryParams = params.filter(p => p.location === 'query');
  const bodyParams = params.filter(p => p.location === 'body');
  const pathParams = params.filter(p => p.location === 'path');

  let handler = '(req, res) => {\n';

  // Extract params
  if (queryParams.length > 0) {
    handler += `    const { ${queryParams.map(p => p.name).join(', ')} } = req.query;\n`;
  }
  if (bodyParams.length > 0) {
    handler += `    const { ${bodyParams.map(p => p.name).join(', ')} } = req.body;\n`;
  }
  if (pathParams.length > 0) {
    handler += `    const { ${pathParams.map(p => p.name).join(', ')} } = req.params;\n`;
  }

  // Response based on method
  if (method === 'GET') {
    handler += `    
    // TODO: Implement data retrieval
    res.json({ 
      message: 'GET ${endpoint.path}',
      data: {} 
    });`;
  } else if (method === 'POST') {
    handler += `    
    // TODO: Implement creation logic
    res.status(201).json({ 
      message: 'Created',
      data: { ${bodyParams.map(p => p.name).join(', ')} }
    });`;
  } else if (method === 'PUT' || method === 'PATCH') {
    handler += `    
    // TODO: Implement update logic
    res.json({ 
      message: 'Updated',
      data: { ${[...pathParams, ...bodyParams].map(p => p.name).join(', ')} }
    });`;
  } else if (method === 'DELETE') {
    handler += `    
    // TODO: Implement deletion logic
    res.json({ message: 'Deleted' });`;
  } else {
    handler += `    
    res.json({ message: '${method} ${endpoint.path}' });`;
  }

  handler += '\n  }';
  return handler;
}

export default EXPRESS_SCAFFOLD;

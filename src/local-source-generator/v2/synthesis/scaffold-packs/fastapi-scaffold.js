/**
 * FastAPI Scaffold Pack - Framework-specific templates for FastAPI
 */

export const FASTAPI_SCAFFOLD = {
    name: 'fastapi',
    framework: 'FastAPI',
    language: 'python',

    /**
     * Project structure template
     */
    structure: {
        'requirements.txt': 'requirements',
        'main.py': 'main',
        'app/__init__.py': 'app_init',
        'app/routes/__init__.py': 'routes_init',
        'app/routes/api.py': 'routes_api',
        'app/middleware/auth.py': 'middleware_auth',
        'app/models/__init__.py': 'models_init',
        'app/schemas/__init__.py': 'schemas_init',
        'app/config.py': 'config',
    },

    /**
     * Templates
     */
    templates: {
        requirements: (config) => `# LSG v2 Generated - FastAPI Application
fastapi>=0.104.0
uvicorn[standard]>=0.24.0
pydantic>=2.5.0
python-dotenv>=1.0.0
${config.auth?.mechanism === 'jwt' ? 'python-jose[cryptography]>=3.3.0\npasslib[bcrypt]>=1.7.4' : ''}
${config.auth?.mechanism === 'oauth2' ? 'authlib>=1.2.0\nhttpx>=0.25.0' : ''}

# Dev dependencies
pytest>=7.4.0
httpx>=0.25.0
`,

        main: (config) => `"""
FastAPI Application - LSG v2 Generated

Generated from TargetModel with ${config.endpoints?.length || 0} endpoints
Epistemic confidence: ${(config.epistemic?.overall_opinion?.b || 0).toFixed(2)}
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from app.routes import api

load_dotenv()

app = FastAPI(
    title="${config.name || 'Generated API'}",
    description="Auto-generated FastAPI from LSG v2",
    version="1.0.0",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(api.router, prefix="/api")

@app.get("/health")
async def health_check():
    return {"status": "ok", "generated": "lsg-v2"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
`,

        routes_api: (config) => {
            const routes = config.endpoints || [];
            let routeHandlers = routes.map(ep => {
                const method = (ep.method || 'get').toLowerCase();
                const path = ep.path || '/';
                return generatePythonHandler(ep);
            }).join('\n\n');

            return `"""
API Routes - LSG v2 Generated
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import Optional, List
${config.auth?.mechanism === 'jwt' ? 'from app.middleware.auth import get_current_user' : ''}

router = APIRouter()

${routeHandlers}
`;
        },

        app_init: () => `"""
App Package - LSG v2 Generated
"""
`,

        routes_init: () => `"""
Routes Package - LSG v2 Generated
"""
`,

        middleware_auth: (config) => {
            if (config.auth?.mechanism === 'jwt') {
                return `"""
JWT Authentication - LSG v2 Generated
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from pydantic import BaseModel
from typing import Optional
import os

SECRET_KEY = os.getenv("JWT_SECRET", "your-secret-key")
ALGORITHM = "HS256"

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

class TokenData(BaseModel):
    username: Optional[str] = None

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        return TokenData(username=username)
    except JWTError:
        raise credentials_exception
`;
            }

            return `"""
Authentication Stub - LSG v2 Generated

Auth mechanism: ${config.auth?.mechanism || 'unknown'}
Note: Implementation details inferred, may need adjustment
"""

async def get_current_user():
    # TODO: Implement authentication based on observed patterns
    # Detected mechanism: ${config.auth?.mechanism || 'unknown'}
    return {"user": "anonymous"}
`;
        },

        models_init: (config) => {
            const models = config.models || [];
            return `"""
Models - LSG v2 Generated

Inferred models: ${models.length}
"""

from pydantic import BaseModel
from typing import Optional, List

${models.map(m => `
class ${m.name}(BaseModel):
    """${m.description || m.name + ' model'}"""
    ${Object.entries(m.fields || {}).map(([k, v]) => `${k}: ${pythonType(v)}`).join('\n    ')}
`).join('\n')}
`;
        },

        schemas_init: () => `"""
Schemas - LSG v2 Generated
"""

from pydantic import BaseModel
from typing import Optional

class Message(BaseModel):
    message: str

class ErrorResponse(BaseModel):
    detail: str
`,

        config: () => `"""
Configuration - LSG v2 Generated
"""

import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    app_name: str = "Generated API"
    debug: bool = os.getenv("DEBUG", "false").lower() == "true"
    jwt_secret: str = os.getenv("JWT_SECRET", "change-in-production")
    
    class Config:
        env_file = ".env"

settings = Settings()
`,
    },
};

/**
 * Generate Python route handler
 */
function generatePythonHandler(endpoint) {
    const method = (endpoint.method || 'GET').toLowerCase();
    const path = endpoint.path || '/';
    const pythonPath = path.replace(/:(\w+)/g, '{$1}');
    const params = endpoint.params || [];

    const queryParams = params.filter(p => p.location === 'query');
    const pathParams = params.filter(p => p.location === 'path');

    let funcParams = [];
    pathParams.forEach(p => funcParams.push(`${p.name}: ${pythonType(p.type)}`));
    queryParams.forEach(p => funcParams.push(`${p.name}: Optional[${pythonType(p.type)}] = None`));

    const funcName = path.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'root';

    return `@router.${method}("${pythonPath}")
async def ${funcName}(${funcParams.join(', ')}):
    """
    ${endpoint.description || `${method.toUpperCase()} ${path}`}
    
    Evidence: ${endpoint.evidence_refs?.length || 0} sources
    Confidence: ${(endpoint.confidence || 0.5).toFixed(2)}
    """
    # TODO: Implement business logic
    return {"message": "${method.toUpperCase()} ${path}", "data": {}}`;
}

/**
 * Convert LSG type to Python type
 */
function pythonType(lsgType) {
    const typeMap = {
        string: 'str',
        integer: 'int',
        number: 'float',
        boolean: 'bool',
        array: 'List',
        object: 'dict',
        uuid: 'str',
        email: 'str',
        date: 'str',
    };
    return typeMap[lsgType] || 'str';
}

export default FASTAPI_SCAFFOLD;

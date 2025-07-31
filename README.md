# Solesonic LLM UI

A React-based user interface for the Solesonic LLM chat application. This project provides a modern, responsive web interface for interacting with the Solesonic LLM API.

## Features

- Chat interface for interacting with Solesonic LLM
- User authentication via AWS Cognito
- Document upload and management
- Integration with Atlassian services
- Responsive design for desktop and mobile

## Getting Started

### Prerequisites

- Node.js (LTS version recommended)
- npm or yarn
- Access to AWS Cognito for authentication (or use mock mode)

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd solesonic-llm-ui
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   ```bash
   cp .env.example .env
   ```
   
   Edit the `.env` file to set your own values for:
   - AWS Cognito User Pool IDs
   - AWS Cognito Client IDs
   - AWS Cognito Domain
   - API and UI base URIs
   
   For development, you can use mock mode by setting:
   ```
   VITE_MOCK_AMPLIFY=true
   VITE_MOCK_API=true
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open your browser and navigate to http://localhost:3000

## Production Deployment

For production deployment using Docker and Nginx, see [README.docker.md](README.docker.md).

## Project Structure

- `src/` - Source code
  - `chat/` - Chat interface components
  - `service/` - Service layer for API communication
  - `client/` - HTTP client configuration
  - `properties/` - Application configuration
  - `util/` - Utility functions

## Security Considerations

- Never commit your `.env` file to version control
- Use environment-specific variables for different deployment environments
- Keep AWS Cognito credentials secure
- Use HTTPS in production environments

## License

[Add your license information here]

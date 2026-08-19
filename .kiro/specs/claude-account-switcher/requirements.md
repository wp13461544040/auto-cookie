# Requirements Document: Claude Account Switcher Chrome Extension

## Functional Requirements

### 1. Account Switching

**1.1** The extension SHALL provide a one-click button to switch Claude accounts
- The button SHALL be accessible from the extension popup
- Clicking the button SHALL initiate the account switching process
- The UI SHALL display loading state during the switch operation

**1.2** The system SHALL retrieve a new sessionKey from the backend API
- The API request SHALL include the user's activation code
- The request SHALL use HTTPS protocol
- The request SHALL include proper headers (Content-Type: application/json)
- The API SHALL return the sessionKey and remaining uses count

**1.3** The system SHALL clear all existing cookies for the claude.ai domain
- All cookies with domain "claude.ai" or ".claude.ai" SHALL be removed
- No cookies from other domains SHALL be affected
- The clearing operation SHALL complete before setting the new sessionKey

**1.4** The system SHALL set the new sessionKey as a cookie for claude.ai
- Cookie name SHALL be "sessionKey"
- Cookie domain SHALL be ".claude.ai"
- Cookie SHALL be marked as secure (HTTPS only)
- Cookie SHALL be marked as httpOnly
- Cookie sameSite attribute SHALL be set to "lax"
- Cookie expiration SHALL be set to 30 days

**1.5** The system SHALL automatically refresh all open claude.ai tabs
- All tabs with URL matching "https://claude.ai/*" SHALL be reloaded
- The reload SHALL happen after the new sessionKey cookie is set
- If no claude.ai tabs are open, the operation SHALL still succeed

**1.6** The system SHALL display the result of the switching operation
- On success: Show success message with remaining uses count
- On failure: Show error message with specific reason
- The status SHALL be displayed in the popup UI


### 2. Activation Code Management

**2.1** The extension SHALL provide a configuration interface for activation codes
- Users SHALL be able to access the options page from the popup
- The options page SHALL provide an input field for activation code
- The options page SHALL provide a "Save" button to store the code

**2.2** The system SHALL validate activation code format before saving
- Activation codes SHALL be 16-32 characters in length
- The validation SHALL reject empty or malformed codes
- Invalid codes SHALL trigger an error message

**2.3** The system SHALL store activation codes securely in local storage
- Activation codes SHALL be stored using chrome.storage.local API
- The stored code SHALL persist across extension restarts
- The stored code SHALL persist across browser sessions

**2.4** The system SHALL retrieve the stored activation code when needed
- The background service worker SHALL read the code from storage
- If no code is stored, the switch operation SHALL fail with an appropriate error
- The error message SHALL direct users to configure the code

### 3. Activation Code Verification (Backend)

**3.1** The backend API SHALL provide an endpoint for sessionKey retrieval
- Endpoint SHALL be POST /api/session-key
- Endpoint SHALL accept JSON payload with activationCode field
- Endpoint SHALL return JSON response with sessionKey and remainingUses

**3.2** The system SHALL validate that the activation code exists in the database
- Non-existent codes SHALL return 401 status with reason "invalid_code"
- The error response SHALL include a descriptive error message

**3.3** The system SHALL verify the activation code is active
- Codes with isActive = false SHALL be rejected
- Rejected codes SHALL return 401 status with reason "disabled"

**3.4** The system SHALL check the activation code expiry date
- Codes past their expiryDate SHALL be rejected
- Rejected codes SHALL return 401 status with reason "expired"

**3.5** The system SHALL enforce usage limits
- Codes where usedCount >= maxUses SHALL be rejected
- Rejected codes SHALL return 401 status with reason "no_uses_left"

**3.6** The system SHALL increment the usage count on successful validation
- usedCount SHALL be incremented by exactly 1
- The increment SHALL be atomic to prevent race conditions
- lastUsedAt SHALL be updated to the current timestamp

**3.7** The system SHALL log all validation attempts
- Each attempt SHALL record: activationCode, timestamp, IP address, user agent, success status
- Failed attempts SHALL include the error reason
- Logs SHALL be stored in the usage_logs table

**3.8** The system SHALL calculate and return remaining uses
- remainingUses = maxUses - usedCount - 1 (after increment)
- The value SHALL be included in the API response


### 4. Activation Code Generation Tool

**4.1** The system SHALL provide a tool to generate activation codes
- The tool SHALL accept maxUses parameter (positive integer)
- The tool SHALL accept expiryDays parameter (positive integer)
- The tool SHALL generate a unique activation code

**4.2** Generated activation codes SHALL follow the specified format
- Codes SHALL be 16 characters long (excluding hyphens)
- Codes SHALL use format: XXXX-XXXX-XXXX-XXXX
- Codes SHALL use alphanumeric characters excluding confusing ones (I, O, 0, 1)
- Character set SHALL be: ABCDEFGHJKLMNPQRSTUVWXYZ23456789

**4.3** The system SHALL ensure activation code uniqueness
- Generated codes SHALL be checked against existing codes in the database
- If a collision occurs, a new code SHALL be generated
- The system SHALL retry up to 10 times before failing

**4.4** The system SHALL create database records for new activation codes
- Record SHALL include: code, maxUses, usedCount (0), expiryDate, isActive (true), createdAt
- expiryDate SHALL be calculated as: current time + expiryDays
- createdAt SHALL be set to current timestamp

**4.5** The tool SHALL provide functionality to list activation codes
- List SHALL support filtering by isActive status
- List SHALL support filtering by expiry date range
- Each entry SHALL display: code, usage statistics, expiry date, active status

**4.6** The tool SHALL provide functionality to disable activation codes
- Disabled codes SHALL have isActive set to false
- Disabled codes SHALL remain in the database for audit purposes
- Disabled codes SHALL fail validation with reason "disabled"

**4.7** The tool SHALL provide functionality to export activation codes
- Export formats SHALL include CSV and JSON
- Exports SHALL include all relevant code metadata
- Exports SHALL be available for administrative purposes

### 5. User Interface Requirements

**5.1** The popup UI SHALL display the current extension status
- Status indicators: Ready, Loading, Success, Error
- Status SHALL include a descriptive message
- Success status SHALL show remaining uses count

**5.2** The popup UI SHALL provide a "Switch Account" button
- Button SHALL be prominently displayed
- Button SHALL be disabled during loading state
- Button SHALL show loading indicator when operation is in progress

**5.3** The popup UI SHALL provide access to the options page
- A "Configure" or "Settings" link SHALL be visible
- Clicking the link SHALL open the options page in a new tab

**5.4** The options page SHALL provide activation code configuration
- Input field for entering activation code
- "Save" button to store the code
- Success/error feedback after saving
- Display of currently configured code (if any)

**5.5** The UI SHALL display appropriate error messages
- "Please configure activation code in options" when code is missing
- "Invalid activation code" for validation failures
- "Activation code has expired" for expired codes
- "No remaining uses" when usage limit is reached
- "Unable to reach server" for network errors


### 6. Data Persistence Requirements

**6.1** The system SHALL persist activation code configuration
- Activation codes SHALL be stored in chrome.storage.local
- The storage key SHALL be "activationCode"
- The data SHALL persist across extension restarts

**6.2** The system SHALL cache usage statistics
- lastSwitchTime SHALL be stored after each successful switch
- remainingUses SHALL be cached after each API response
- Cache SHALL be updated on every successful operation

**6.3** The backend SHALL maintain activation code records
- Records SHALL be stored in activation_codes table
- Table SHALL include: id, code, maxUses, usedCount, expiryDate, isActive, createdAt, lastUsedAt
- All fields SHALL be properly indexed for performance

**6.4** The backend SHALL maintain usage logs
- Logs SHALL be stored in usage_logs table
- Table SHALL include: id, activationCode, usedAt, ipAddress, userAgent, success, errorReason
- Logs SHALL be retained for audit and security analysis

## Non-Functional Requirements

### 7. Performance Requirements

**7.1** Cookie operations SHALL complete within 500 milliseconds
- Clearing all cookies SHALL complete in < 500ms for typical scenarios (< 20 cookies)
- Setting sessionKey cookie SHALL complete in < 100ms
- Performance SHALL be measured using performance.now() timestamps

**7.2** API requests SHALL complete within 2 seconds under normal conditions
- API validation request SHALL complete in < 2 seconds
- Slow requests (> 3 seconds) SHALL be logged for investigation
- Network timeout SHALL be set to 10 seconds

**7.3** Database queries SHALL complete within 100 milliseconds
- Activation code validation query SHALL complete in < 100ms
- Slow queries (> 200ms) SHALL be logged
- Proper indexes SHALL be used to ensure performance

**7.4** The extension bundle size SHALL be under 500 KB uncompressed
- Minimize dependencies to reduce size
- Use tree-shaking to eliminate unused code
- Compress images and icons

**7.5** Background service worker memory usage SHALL be under 50 MB idle
- Memory usage SHALL not exceed 100 MB during operation
- Memory leaks SHALL be prevented through proper cleanup
- Memory SHALL be monitored using Chrome Task Manager

### 8. Security Requirements

**8.1** All API communication SHALL use HTTPS
- TLS version SHALL be 1.2 or higher
- SSL certificates SHALL be validated
- SessionKeys SHALL never be transmitted over HTTP

**8.2** SessionKey cookies SHALL use secure attributes
- secure flag SHALL be set to true (HTTPS only)
- httpOnly flag SHALL be set to true (no JavaScript access)
- sameSite SHALL be set to "lax" or "strict"
- domain SHALL be limited to .claude.ai

**8.3** The system SHALL prevent SQL injection attacks
- All database queries SHALL use parameterized statements
- User input SHALL never be concatenated into SQL strings
- Input validation SHALL be performed before database queries


**8.4** The system SHALL implement rate limiting
- API SHALL accept maximum 10 requests per minute per IP address
- Excessive requests SHALL return 429 (Too Many Requests) status
- Rate limiting SHALL prevent brute force attacks

**8.5** The system SHALL prevent activation code brute force
- Activation codes SHALL be at least 16 characters long
- Character set SHALL provide at least 32^16 possible combinations
- Failed attempts SHALL be logged with IP address
- IPs with 50+ failed attempts in 1 hour SHALL be blocked

**8.6** The extension SHALL request minimal permissions
- Required permissions: cookies, storage, tabs
- host_permissions SHALL be limited to https://claude.ai/*
- No unnecessary permissions SHALL be requested

**8.7** The system SHALL implement Content Security Policy
- Inline scripts SHALL be prohibited
- Only self-hosted scripts SHALL be allowed
- eval() and similar dynamic code execution SHALL be prohibited

**8.8** Activation codes SHALL be stored securely
- chrome.storage.local provides per-extension isolation
- Codes SHALL not be accessible by other extensions
- Users SHALL be advised to treat codes as passwords

### 9. Reliability Requirements

**9.1** The system SHALL handle network failures gracefully
- Failed API requests SHALL return user-friendly error messages
- Network timeouts SHALL be caught and reported
- Users SHALL be able to retry after failures

**9.2** The system SHALL handle concurrent requests correctly
- Database transactions SHALL use row-level locking
- Race conditions on usedCount SHALL be prevented
- Only one concurrent request SHALL succeed per activation code

**9.3** The system SHALL maintain data consistency
- usedCount SHALL never exceed maxUses
- usedCount SHALL never decrease
- All database operations SHALL be atomic

**9.4** The system SHALL handle edge cases
- Missing activation codes SHALL be reported clearly
- No open claude.ai tabs SHALL not prevent success
- Empty cookie lists SHALL be handled gracefully

### 10. Usability Requirements

**10.1** The extension SHALL provide clear user feedback
- All operations SHALL display appropriate status messages
- Errors SHALL include actionable guidance
- Success states SHALL include remaining uses information

**10.2** The configuration process SHALL be straightforward
- Options page SHALL be easily accessible from popup
- Activation code input SHALL be clearly labeled
- Save confirmation SHALL be immediate and visible

**10.3** Error messages SHALL be user-friendly
- Technical jargon SHALL be avoided
- Messages SHALL suggest remediation steps
- Contact information or help links SHALL be provided (optional)

### 11. Compatibility Requirements

**11.1** The extension SHALL be compatible with Chrome Manifest V3
- All APIs SHALL use Manifest V3 specifications
- Background scripts SHALL use service workers
- Permissions SHALL follow V3 best practices

**11.2** The extension SHALL support Chrome version 88+
- All Chrome APIs used SHALL be available in Chrome 88+
- No deprecated APIs SHALL be used
- Compatibility SHALL be tested on multiple Chrome versions

**11.3** The backend SHALL support multiple database systems
- MySQL 8.0+ SHALL be supported
- PostgreSQL 13+ SHALL be supported
- SQLite SHALL be supported for development/testing

**11.4** The backend SHALL run on Node.js 18+
- All Node.js features SHALL be compatible with version 18+
- Dependencies SHALL support Node.js 18+


### 12. Maintainability Requirements

**12.1** The codebase SHALL follow TypeScript best practices
- Type annotations SHALL be used throughout
- Strict mode SHALL be enabled
- No 'any' types SHALL be used without justification

**12.2** The code SHALL include appropriate documentation
- All public functions SHALL have JSDoc comments
- Complex algorithms SHALL include explanatory comments
- README SHALL include setup and usage instructions

**12.3** The code SHALL follow consistent style guidelines
- ESLint SHALL be used for linting
- Prettier SHALL be used for code formatting
- Style SHALL be consistent across all files

**12.4** The system SHALL include comprehensive tests
- Unit test coverage SHALL be at least 80%
- Integration tests SHALL cover critical flows
- Property-based tests SHALL verify key invariants

### 13. Scalability Requirements

**13.1** The API server SHALL support horizontal scaling
- Multiple API instances SHALL be deployable behind a load balancer
- No session state SHALL be stored in memory
- All state SHALL be in the database

**13.2** The database SHALL support read replicas
- Primary-replica setup SHALL be supported
- Read operations SHALL be distributable to replicas
- Write operations SHALL go to primary only

**13.3** The system SHALL handle high request volumes
- API SHALL support at least 100 requests per second
- Database connection pooling SHALL be implemented
- Caching SHALL be used where appropriate (optional)

### 14. Monitoring and Logging Requirements

**14.1** The system SHALL log all activation code operations
- All validation attempts SHALL be logged
- Logs SHALL include timestamp, IP address, success status
- Failed attempts SHALL include error reason

**14.2** The system SHALL log performance metrics
- API response times SHALL be logged
- Database query times SHALL be logged
- Slow operations SHALL be flagged for investigation

**14.3** The system SHALL support health checks
- API SHALL provide a health check endpoint
- Health check SHALL verify database connectivity
- Health check SHALL return 200 for healthy, 503 for unhealthy

**14.4** The extension SHALL log errors for debugging
- Errors SHALL be logged to console in development mode
- Critical errors SHALL be logged in production mode
- User privacy SHALL be maintained in logs (no sensitive data)

### 15. Deployment Requirements

**15.1** The extension SHALL be packageable for Chrome Web Store
- All required manifest fields SHALL be populated
- Icons SHALL be provided in required sizes (16x16, 48x48, 128x128)
- Privacy policy SHALL be included if required

**15.2** The backend SHALL be deployable via Docker
- Dockerfile SHALL be provided
- Docker Compose configuration SHALL be provided
- Environment variables SHALL be used for configuration

**15.3** The system SHALL support environment-based configuration
- Development, staging, and production environments SHALL be supported
- API endpoints SHALL be configurable
- Database credentials SHALL be configurable via environment variables

**15.4** The database schema SHALL be versionable
- Migration scripts SHALL be provided
- Schema versions SHALL be tracked
- Rollback procedures SHALL be documented

## Constraints

**16.1** The extension MUST comply with Chrome Web Store policies
- No malicious code or behavior
- User data SHALL be handled according to privacy policies
- Permissions SHALL be justified in the store listing

**16.2** The system MUST comply with data protection regulations
- User data (activation codes, logs) SHALL be protected
- Data retention policies SHALL be defined
- Users SHALL be informed of data collection (if applicable)

**16.3** The implementation MUST use specified technologies
- Chrome Extension Manifest V3
- TypeScript or JavaScript for extension code
- Node.js for backend API
- Relational database (MySQL/PostgreSQL/SQLite)

**16.4** The system MUST NOT interfere with Claude.ai functionality
- Only cookie operations SHALL be performed
- No modification of claude.ai page content
- No injection of scripts into claude.ai pages

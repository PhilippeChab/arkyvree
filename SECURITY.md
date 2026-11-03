# Security policy

## Report privately

Email **[philippe.chab@outlook.com](mailto:philippe.chab@outlook.com)** with the
subject “Arkyvree security report”. Do not put vulnerabilities, credentials,
exploit details, or user data in a public issue or pull request.

Include, when available:

- the affected commit, environment, and feature;
- reproduction steps using a local instance and synthetic data;
- the expected and actual behavior;
- the potential impact and any suggested mitigation.

Redact secrets and personal information. If you discover a live credential,
describe its location without reproducing it unnecessarily.

## Safe research

Use a local instance or an environment you are explicitly authorized to test.
This policy does not authorize testing the hosted service, accessing other
people's accounts or data, service disruption, social engineering, or scanning
third-party infrastructure. Stop if your investigation would expose someone
else's private data.

## Support and disclosure

Security fixes are prioritized for the latest `main` branch. Older commits,
downstream forks, and self-hosted installations do not have a guaranteed
backport or support window. Maintainer availability determines response times;
there is no guaranteed response deadline or bug bounty.

Please coordinate public disclosure with the maintainer so affected users can
receive a fix or mitigation. Maintainers may publish an advisory and credit
reporters with their consent.

Self-hosters are responsible for updates, access control, backups, secret
management, and the security of their deployment and dependencies. Example
environment files are for local development only.

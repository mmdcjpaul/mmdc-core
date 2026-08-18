import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const templatePath = 'infrastructure/cloudformation/development.json';
const templateText = readFileSync(templatePath, 'utf8');
const template = JSON.parse(templateText);
const resources = template.Resources;

const requiredTags = {
  Project: { Ref: 'ProjectName' },
  Environment: { Ref: 'EnvironmentName' },
  ManagedBy: 'cloudformation',
  Owner: { Ref: 'OwnerTag' }
};
const untaggableTypes = new Set([
  'AWS::IAM::Policy',
  'AWS::S3::BucketPolicy',
  'AWS::Route53::RecordSet',
  'AWS::Lightsail::StaticIp'
]);
const expectedTypes = new Set([
  'AWS::CloudWatch::Alarm',
  'AWS::CloudFront::Distribution',
  'AWS::ECR::Repository',
  'AWS::IAM::OIDCProvider',
  'AWS::IAM::Role',
  'AWS::IAM::User',
  'AWS::Lightsail::Instance',
  'AWS::Lightsail::StaticIp',
  'AWS::Route53::RecordSet',
  'AWS::S3::Bucket',
  'AWS::S3::BucketPolicy'
]);

assert.equal(typeof template, 'object', 'template is a JSON CloudFormation document');
for (const section of ['Parameters', 'Rules', 'Conditions', 'Resources', 'Outputs']) {
  assert.ok(template[section], `template has ${section}`);
}
assert.equal(template.Parameters.EnvironmentName.Default, 'development');
assert.deepEqual(template.Parameters.EnvironmentName.AllowedValues, ['development']);
assert.deepEqual(template.Parameters.ProjectName.AllowedValues, ['mmdc-v3']);
assert.deepEqual(template.Rules.ApprovedRegion.Assertions[0].Assert, {
  'Fn::Equals': [{ Ref: 'AWS::Region' }, 'ap-southeast-1']
});

const requiredResources = {
  ApplicationRepository: 'AWS::ECR::Repository',
  MediaBucket: 'AWS::S3::Bucket',
  BackupBucket: 'AWS::S3::Bucket',
  DeploymentBucket: 'AWS::S3::Bucket',
  GitHubDevelopmentDeployRole: 'AWS::IAM::Role',
  ApplicationStorageUser: 'AWS::IAM::User',
  DevelopmentInstance: 'AWS::Lightsail::Instance',
  DevelopmentStaticIp: 'AWS::Lightsail::StaticIp',
  DevelopmentCpuAlarm: 'AWS::CloudWatch::Alarm',
  DevelopmentBurstCapacityAlarm: 'AWS::CloudWatch::Alarm',
  DevelopmentCloudFrontDistribution: 'AWS::CloudFront::Distribution',
  DevelopmentDnsRecord: 'AWS::Route53::RecordSet'
};
for (const [logicalId, type] of Object.entries(requiredResources)) {
  assert.equal(resources[logicalId]?.Type, type, `${logicalId} is defined as ${type}`);
}
for (const [logicalId, resource] of Object.entries(resources)) {
  assert.ok(expectedTypes.has(resource.Type), `${logicalId} uses an approved AWS resource type`);
  assert.ok(resource.Properties, `${logicalId} has CloudFormation properties`);
  if (!untaggableTypes.has(resource.Type)) {
    const tags = Object.fromEntries((resource.Properties.Tags ?? []).map(({ Key, Value }) => [Key, Value]));
    for (const [key, value] of Object.entries(requiredTags)) {
      assert.deepEqual(tags[key], value, `${logicalId} carries the ${key} tag`);
    }
  }
}

for (const logicalId of ['MediaBucket', 'BackupBucket', 'DeploymentBucket']) {
  const bucket = resources[logicalId];
  assert.equal(bucket.DeletionPolicy, 'Retain', `${logicalId} retains canonical state on deletion`);
  assert.equal(bucket.UpdateReplacePolicy, 'Retain', `${logicalId} retains canonical state on replacement`);
  assert.deepEqual(bucket.Properties.VersioningConfiguration, { Status: 'Enabled' });
  assert.deepEqual(bucket.Properties.PublicAccessBlockConfiguration, {
    BlockPublicAcls: true,
    BlockPublicPolicy: true,
    IgnorePublicAcls: true,
    RestrictPublicBuckets: true
  });
  assert.equal(
    bucket.Properties.BucketEncryption.ServerSideEncryptionConfiguration[0].ServerSideEncryptionByDefault.SSEAlgorithm,
    'AES256'
  );
  const lifecycleRules = bucket.Properties.LifecycleConfiguration.Rules;
  assert.ok(lifecycleRules.some(({ AbortIncompleteMultipartUpload }) => AbortIncompleteMultipartUpload));
  assert.ok(lifecycleRules.some(({ NoncurrentVersionExpiration }) => NoncurrentVersionExpiration));
  const policy = resources[`${logicalId}Policy`];
  assert.equal(
    policy.Properties.PolicyDocument.Statement.every(({ Effect }) => Effect === 'Deny'),
    true,
    `${logicalId} has no public allow policy`
  );
}

const ecr = resources.ApplicationRepository;
assert.equal(ecr.DeletionPolicy, 'Retain');
assert.equal(ecr.UpdateReplacePolicy, 'Retain');
assert.equal(ecr.Properties.ImageTagMutability, 'IMMUTABLE');
assert.equal(ecr.Properties.ImageScanningConfiguration.ScanOnPush, true);
assert.match(ecr.Properties.LifecyclePolicy.LifecyclePolicyText, /tagStatus/);
assert.match(ecr.Properties.LifecyclePolicy.LifecyclePolicyText, /countNumber/);
assert.equal(resources.DevelopmentInstance.DeletionPolicy, 'Retain');
assert.equal(resources.DevelopmentInstance.UpdateReplacePolicy, 'Retain');
assert.deepEqual(resources.DevelopmentStaticIp.Properties.AttachedTo, { Ref: 'DevelopmentInstance' });

const ports = resources.DevelopmentInstance.Properties.Networking.Ports;
assert.deepEqual(
  ports.map(({ FromPort, ToPort, Protocol }) => [FromPort, ToPort, Protocol]),
  [
    [22, 22, 'tcp'],
    [80, 80, 'tcp'],
    [443, 443, 'tcp']
  ]
);
const sshPort = ports.find(({ FromPort, ToPort }) => FromPort === 22 && ToPort === 22);
assert.equal(sshPort.AccessType, 'Public');
assert.equal(sshPort.AccessFrom, 'Custom');
assert.deepEqual(sshPort.Cidrs, [{ Ref: 'SshCidr' }]);
assert.deepEqual(sshPort.CidrListAliases, ['lightsail-connect']);
assert.ok(
  ports
    .filter(({ FromPort }) => FromPort !== 22)
    .every(
      ({ AccessType, AccessFrom, Cidrs }) =>
        AccessType === 'Public' && AccessFrom === 'Anywhere (0.0.0.0/0)' && Cidrs.includes('0.0.0.0/0')
    )
);

const raw = JSON.stringify(template);
for (const forbidden of [
  /AKIA[0-9A-Z]{16}/,
  /ASIA[0-9A-Z]{16}/,
  /postgres(?:ql)?:\/\/[^\s:@]+:[^\s@]+@/i,
  /Bearer\s+[A-Za-z0-9._-]{12,}/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:PAYLOAD_SECRET|NEON_API_KEY|AWS_SECRET_ACCESS_KEY|S3_SECRET_ACCESS_KEY)\s*=/i
]) {
  assert.equal(forbidden.test(raw), false, `template does not contain a runtime secret matching ${forbidden}`);
}
assert.equal(
  Object.keys(template.Parameters).some((key) => /secret|password|credential|token|api.?key/i.test(key)),
  false
);
assert.match(resources.DevelopmentInstance.Properties.UserData, /^#!\/usr\/bin\/env bash/);
assert.doesNotMatch(
  resources.DevelopmentInstance.Properties.UserData,
  /AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|postgres(?:ql)?:\/\/[^\s:@]+:[^\s@]+@/i
);
assert.equal(/AWS::Neon|neon[A-Z]/i.test(Object.keys(resources).join('\n')), false, 'no Neon resource is modeled');
assert.equal(
  /production|staging/i.test(Object.keys(resources).join('\n')),
  false,
  'no production or staging resource is modeled'
);

const refs = {
  ProjectName: 'mmdc-v3',
  EnvironmentName: 'development',
  OwnerTag: 'Engineering',
  GitHubRepository: 'mmdcjpaul/mmdc-core',
  GitHubWorkflowRef: 'mmdcjpaul/mmdc-core/.github/workflows/release.yml@refs/heads/development',
  GitHubOidcProviderArn: 'arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com',
  SshCidr: '192.0.2.10/32',
  'AWS::AccountId': '123456789012',
  'AWS::Region': 'ap-southeast-1'
};
const values = {
  ApplicationRepository: 'mmdc-v3-development',
  MediaBucket: 'mmdc-v3-development-media-123456789012-ap-southeast-1',
  BackupBucket: 'mmdc-v3-development-backups-123456789012-ap-southeast-1',
  DeploymentBucket: 'mmdc-v3-development-deployments-123456789012-ap-southeast-1'
};
function render(value) {
  if (typeof value === 'string') return value;
  if (value == null) return value;
  if (value.Ref) return refs[value.Ref] ?? values[value.Ref] ?? `REF(${value.Ref})`;
  if (value['Fn::GetAtt']) {
    const [logicalId, attribute] = value['Fn::GetAtt'];
    if (attribute === 'Arn' && values[logicalId]) {
      if (logicalId === 'ApplicationRepository')
        return `arn:aws:ecr:ap-southeast-1:${refs['AWS::AccountId']}:repository/${values[logicalId]}`;
      return `arn:aws:s3:::${values[logicalId]}`;
    }
    return `GETATT(${logicalId}.${attribute})`;
  }
  if (value['Fn::Sub']) {
    const [expression, explicitVariables] = Array.isArray(value['Fn::Sub']) ? value['Fn::Sub'] : [value['Fn::Sub'], {}];
    return expression.replace(/\$\{([^}]+)\}/g, (_, name) => {
      if (explicitVariables?.[name]) return render(explicitVariables[name]);
      if (name.includes('.')) {
        const [logicalId, attribute] = name.split('.');
        return render({ 'Fn::GetAtt': [logicalId, attribute] });
      }
      return render({ Ref: name });
    });
  }
  return JSON.stringify(value);
}
function listActions(statement) {
  return Array.isArray(statement.Action) ? statement.Action : [statement.Action];
}
function globMatches(glob, value) {
  return new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`).test(value);
}
function conditionMatches(statement, context = {}) {
  for (const [operator, entries] of Object.entries(statement.Condition ?? {})) {
    for (const [key, expected] of Object.entries(entries)) {
      const actual = context[key];
      const candidates = Array.isArray(expected) ? expected : [expected];
      if (actual == null) return false;
      const matched = candidates.some((candidate) => {
        const resolved = candidate && typeof candidate === 'object' ? render(candidate) : candidate;
        return operator === 'StringEquals'
          ? actual === resolved
          : operator === 'StringLike'
            ? globMatches(resolved, actual)
            : false;
      });
      if (!matched) return false;
    }
  }
  return true;
}
function allows(statement, action, resource, context = {}) {
  if (statement.Effect !== 'Allow' || !listActions(statement).includes(action)) return false;
  if (!conditionMatches(statement, context)) return false;
  const resourcesForStatement = Array.isArray(statement.Resource) ? statement.Resource : [statement.Resource];
  return resourcesForStatement.some((candidate) => {
    const pattern = render(candidate)
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    return new RegExp(`^${pattern}$`).test(resource);
  });
}
function policyStatements(resource) {
  return resource.Properties.Policies.flatMap(({ PolicyDocument }) => PolicyDocument.Statement);
}
const publisherStatements = policyStatements(resources.GitHubDevelopmentDeployRole).map((statement) => ({
  ...statement,
  renderedResource: render(statement.Resource)
}));
const hostStatements = policyStatements(resources.ApplicationStorageUser).map((statement) => ({
  ...statement,
  renderedResource: render(statement.Resource)
}));
const ecrArn = render({ 'Fn::GetAtt': ['ApplicationRepository', 'Arn'] });
const mediaPrefix = `${render({ 'Fn::GetAtt': ['MediaBucket', 'Arn'] })}/media/record-00000000/file.png`;
const mediaOtherPrefix = `${render({ 'Fn::GetAtt': ['MediaBucket', 'Arn'] })}/private/file.png`;
const stateArn = render({ 'Fn::GetAtt': ['DeploymentBucket', 'Arn'] });
const backupArn = render({ 'Fn::GetAtt': ['BackupBucket', 'Arn'] });

const mediaLocationStatement = hostStatements.find(({ Sid }) => Sid === 'GetDevelopmentMediaBucketLocation');
const mediaListStatement = hostStatements.find(({ Sid }) => Sid === 'ListDevelopmentMediaPrefixOnly');
assert.deepEqual(listActions(mediaLocationStatement), ['s3:GetBucketLocation']);
assert.equal(mediaLocationStatement.Condition, undefined, 'GetBucketLocation has no ListBucket prefix condition');
assert.deepEqual(listActions(mediaListStatement), ['s3:ListBucket']);
assert.deepEqual(mediaListStatement.Condition, { StringLike: { 's3:prefix': ['media', 'media/*'] } });

// Dependency-free IAM simulation for the effective allow boundary. Conditions
// are evaluated so a prefix-scoped ListBucket statement cannot accidentally
// look equivalent to an unconditioned bucket operation.
assert.equal(
  hostStatements.some((statement) =>
    allows(statement, 's3:GetBucketLocation', render({ 'Fn::GetAtt': ['MediaBucket', 'Arn'] }))
  ),
  true,
  'host can get the media bucket location without a prefix context'
);
assert.equal(
  hostStatements.some((statement) => allows(statement, 's3:GetBucketLocation', stateArn)),
  false,
  'host cannot get the location of the deployment-state bucket'
);
for (const prefix of ['media', 'media/record-00000000/']) {
  assert.equal(
    hostStatements.some((statement) =>
      allows(statement, 's3:ListBucket', render({ 'Fn::GetAtt': ['MediaBucket', 'Arn'] }), { 's3:prefix': prefix })
    ),
    true,
    `host can list the approved media prefix ${prefix}`
  );
}
for (const prefix of ['private', 'media-other']) {
  assert.equal(
    hostStatements.some((statement) =>
      allows(statement, 's3:ListBucket', render({ 'Fn::GetAtt': ['MediaBucket', 'Arn'] }), { 's3:prefix': prefix })
    ),
    false,
    `host cannot list the unapproved media prefix ${prefix}`
  );
}
assert.equal(
  hostStatements.some((statement) => allows(statement, 's3:GetObject', mediaPrefix)),
  true,
  'host can read media objects'
);
assert.equal(
  hostStatements.some((statement) => allows(statement, 's3:PutObject', mediaPrefix)),
  true,
  'host can write media objects'
);
assert.equal(
  hostStatements.some((statement) => allows(statement, 's3:DeleteObject', mediaPrefix)),
  true,
  'host can delete media objects for governed replacement/recovery'
);
assert.equal(
  hostStatements.some((statement) => allows(statement, 's3:GetObject', mediaOtherPrefix)),
  false,
  'host cannot read objects outside media/'
);
assert.equal(
  hostStatements.some((statement) => allows(statement, 's3:GetObject', `${stateArn}/desired.json`)),
  true,
  'host can read the exact desired-state object'
);
assert.equal(
  hostStatements.some((statement) => allows(statement, 's3:PutObject', `${stateArn}/status/commit.json`)),
  true,
  'host can write bounded deployment status'
);
assert.equal(
  hostStatements.some((statement) => allows(statement, 's3:PutObject', `${stateArn}/desired.json`)),
  false,
  'host cannot overwrite desired state'
);
assert.equal(
  hostStatements.some((statement) => allows(statement, 's3:GetObject', `${stateArn}/status/commit.json`)),
  false,
  'host cannot read deployment status'
);
assert.equal(
  hostStatements.some((statement) => allows(statement, 's3:GetBucketLocation', backupArn)),
  true,
  'host can get the dedicated backup bucket location'
);
assert.equal(
  hostStatements.some((statement) => allows(statement, 's3:ListBucket', backupArn)),
  true,
  'host can list the dedicated backup bucket for recovery operations'
);
assert.equal(
  hostStatements.some((statement) => allows(statement, 's3:PutObject', `${backupArn}/recovery.dump`)),
  true,
  'host can write backup objects only in the dedicated backup bucket'
);
assert.equal(
  hostStatements.some((statement) => allows(statement, 's3:DeleteObject', `${backupArn}/recovery.dump`)),
  false,
  'host cannot delete backup objects'
);
assert.equal(
  hostStatements.some((statement) => allows(statement, 's3:GetObject', `${backupArn}/recovery.dump`)),
  true,
  'host can read backup objects for recovery verification'
);
assert.equal(
  hostStatements.some((statement) =>
    allows(statement, 's3:GetObject', 'arn:aws:s3:::other-development-bucket/media/file.png')
  ),
  false,
  'host cannot access an unrelated bucket'
);
assert.equal(
  hostStatements.some((statement) => allows(statement, 'ecr:BatchGetImage', ecrArn)),
  true,
  'host can pull images from development ECR'
);
assert.equal(
  hostStatements.some((statement) => allows(statement, 'ecr:PutImage', ecrArn)),
  false,
  'host cannot publish images'
);

assert.equal(
  publisherStatements.some((statement) => allows(statement, 'ecr:PutImage', `${ecrArn}`)),
  true,
  'publisher allows image publication to the development repository'
);
assert.equal(
  publisherStatements.some((statement) => allows(statement, 'ecr:PutImage', `${ecrArn}-other`)),
  false,
  'publisher denies image publication to another repository'
);
assert.equal(
  publisherStatements.some((statement) => allows(statement, 's3:PutObject', `${stateArn}/desired.json`)),
  true,
  'publisher allows only desired-state publication'
);
assert.equal(
  publisherStatements.some((statement) => allows(statement, 's3:PutObject', `${stateArn}/status/commit.json`)),
  false,
  'publisher cannot write host status'
);
assert.equal(
  publisherStatements.some((statement) => allows(statement, 's3:GetObject', `${stateArn}/desired.json`)),
  false,
  'publisher cannot read deployment state'
);

assert.equal(
  hostStatements.some((statement) => allows(statement, 'ecr:BatchGetImage', ecrArn)),
  true,
  'host allows image pull from development ECR'
);
assert.equal(
  hostStatements.some((statement) => allows(statement, 'ecr:PutImage', ecrArn)),
  false,
  'host cannot publish to ECR'
);
assert.equal(
  hostStatements.some((statement) => allows(statement, 's3:GetObject', `${stateArn}/desired.json`)),
  true,
  'host can read exact desired state'
);
assert.equal(
  hostStatements.some((statement) => allows(statement, 's3:PutObject', `${stateArn}/status/commit.json`)),
  true,
  'host can write bounded status'
);
assert.equal(
  hostStatements.some((statement) => allows(statement, 's3:PutObject', `${stateArn}/desired.json`)),
  false,
  'host cannot overwrite desired state'
);
assert.equal(
  hostStatements.some((statement) => allows(statement, 's3:GetObject', mediaPrefix)),
  true,
  'host can read development media objects'
);
assert.equal(
  hostStatements.some((statement) => allows(statement, 's3:PutObject', mediaOtherPrefix)),
  false,
  'host cannot write outside media prefix'
);
assert.equal(
  hostStatements.some((statement) => allows(statement, 's3:ListBucket', stateArn)),
  false,
  'host cannot list deployment-state bucket'
);

for (const statement of [...publisherStatements, ...hostStatements]) {
  if (statement.Effect !== 'Allow') continue;
  const actions = listActions(statement);
  const resourceList = Array.isArray(statement.Resource) ? statement.Resource : [statement.Resource];
  assert.equal(actions.includes('*'), false, 'allow statement has no wildcard action');
  if (statement.Sid !== 'EcrTokenForAwsRegistry')
    assert.equal(
      resourceList.some((value) => render(value) === '*'),
      false,
      `${statement.Sid} has no wildcard resource`
    );
}

const trustStatement = resources.GitHubDevelopmentDeployRole.Properties.AssumeRolePolicyDocument.Statement[0];
assert.equal(trustStatement.Principal.Federated.Ref, 'GitHubOidcProviderArn');
assert.equal(trustStatement.Condition.StringEquals['token.actions.githubusercontent.com:aud'], 'sts.amazonaws.com');
const trustedSub = render(trustStatement.Condition.StringLike['token.actions.githubusercontent.com:sub']);
const trustedWorkflow = render(
  trustStatement.Condition.StringLike['token.actions.githubusercontent.com:job_workflow_ref']
);
assert.equal(
  globMatches(trustedSub, 'repo:mmdcjpaul/mmdc-core:ref:refs/tags/v1.2.3-dev.4'),
  true,
  'OIDC trust allows an approved development tag'
);
assert.equal(
  globMatches(trustedSub, 'repo:mmdcjpaul/mmdc-core:ref:refs/heads/development'),
  false,
  'OIDC trust denies branch pushes'
);
assert.equal(
  globMatches(trustedSub, 'repo:other/repo:ref:refs/tags/v1.2.3-dev.4'),
  false,
  'OIDC trust denies another repository'
);
assert.equal(
  globMatches(trustedSub, 'repo:mmdcjpaul/mmdc-core:ref:refs/tags/v1.2.3'),
  false,
  'OIDC trust denies a production tag'
);
assert.equal(trustedWorkflow, refs.GitHubWorkflowRef, 'OIDC trust requires the exact approved workflow ref');
const releaseWorkflow = readFileSync('.github/workflows/release.yml', 'utf8');
assert.match(releaseWorkflow, /on:\n  push:\n    tags:\n      - ['"]v\*\.\*\.\*-dev\.\*['"]/);
assert.match(releaseWorkflow, /publish:[\s\S]*?environment: development/);
assert.match(releaseWorkflow, /publish:[\s\S]*?id-token: write/);
assert.match(releaseWorkflow, /AWS_ROLE_ARN: arn:aws:iam::349762920349:role\/mmdc-v3-development-github-deploy/);
const releaseClaims = {
  'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
  'token.actions.githubusercontent.com:sub': 'repo:mmdcjpaul/mmdc-core:ref:refs/tags/v0.1.0-dev.1',
  'token.actions.githubusercontent.com:job_workflow_ref': refs.GitHubWorkflowRef
};
assert.equal(conditionMatches(trustStatement, releaseClaims), true, 'OIDC trust accepts the exact release claims');
assert.equal(
  conditionMatches(trustStatement, {
    ...releaseClaims,
    'token.actions.githubusercontent.com:sub': 'repo:mmdcjpaul/mmdc-core:ref:refs/heads/development'
  }),
  false,
  'OIDC trust rejects a development branch push'
);
assert.equal(
  conditionMatches(trustStatement, {
    ...releaseClaims,
    'token.actions.githubusercontent.com:job_workflow_ref': `${refs.GitHubWorkflowRef}-untrusted`
  }),
  false,
  'OIDC trust rejects a different workflow file/ref'
);
assert.equal(
  conditionMatches(trustStatement, {
    ...releaseClaims,
    'token.actions.githubusercontent.com:sub': 'repo:mmdcjpaul/mmdc-core:ref:refs/tags/v0.1.0-rc.1'
  }),
  false,
  'OIDC trust rejects a non-development tag'
);

const costRegister = readFileSync('docs/registers/cost-retention-register.md', 'utf8');
for (const subject of [
  'S3 media objects and noncurrent versions',
  'ECR image storage and scan artifacts',
  'Lightsail instance, static IP, attached state, and snapshots'
]) {
  assert.match(costRegister, new RegExp(`\\|[^|]*${subject}[^|]*\\|`));
}
const costOutput = template.Outputs.MonthlyPlanningCostEstimate.Value;
assert.match(costOutput, /USD 80-205 per month/);
assert.match(costOutput, /USD 40-265/);
assert.match(costOutput, /USD 80-345/);
assert.match(costRegister, /planning envelope is \*\*USD 40–265 per month\*\*/);

console.log(
  'F08-T01 probe: JSON CloudFormation validation/lint, resource inventory, private buckets, retention, region, ports, secret boundary, cost output, and IAM allow/deny simulations passed'
);

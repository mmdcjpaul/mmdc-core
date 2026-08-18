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
  DevelopmentEcrRepository: 'AWS::ECR::Repository',
  DevelopmentMediaBucket: 'AWS::S3::Bucket',
  DevelopmentDeploymentStateBucket: 'AWS::S3::Bucket',
  GitHubOidcProvider: 'AWS::IAM::OIDCProvider',
  GitHubPublisherRole: 'AWS::IAM::Role',
  DevelopmentHostWorkloadUser: 'AWS::IAM::User',
  DevelopmentLightsailInstance: 'AWS::Lightsail::Instance',
  DevelopmentLightsailStaticIp: 'AWS::Lightsail::StaticIp',
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

for (const logicalId of ['DevelopmentMediaBucket', 'DevelopmentDeploymentStateBucket']) {
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
  const lifecycleIds = bucket.Properties.LifecycleConfiguration.Rules.map(({ Id }) => Id);
  assert.ok(lifecycleIds.some((id) => id.includes('AbortIncomplete')));
  assert.ok(lifecycleIds.some((id) => id.includes('Noncurrent')));
  const policy =
    resources[
      logicalId === 'DevelopmentMediaBucket' ? 'DevelopmentMediaBucketPolicy' : 'DevelopmentDeploymentStateBucketPolicy'
    ];
  assert.equal(
    policy.Properties.PolicyDocument.Statement.every(({ Effect }) => Effect === 'Deny'),
    true,
    `${logicalId} has no public allow policy`
  );
}

const ecr = resources.DevelopmentEcrRepository;
assert.equal(ecr.DeletionPolicy, 'Retain');
assert.equal(ecr.UpdateReplacePolicy, 'Retain');
assert.equal(ecr.Properties.ImageTagMutability, 'IMMUTABLE');
assert.equal(ecr.Properties.ImageScanningConfiguration.ScanOnPush, true);
assert.match(ecr.Properties.LifecyclePolicy.LifecyclePolicyText, /tagStatus/);
assert.match(ecr.Properties.LifecyclePolicy.LifecyclePolicyText, /countNumber/);
assert.equal(resources.DevelopmentLightsailInstance.DeletionPolicy, 'Retain');
assert.equal(resources.DevelopmentLightsailInstance.UpdateReplacePolicy, 'Retain');
assert.deepEqual(resources.DevelopmentLightsailStaticIp.Properties.AttachedTo, { Ref: 'DevelopmentLightsailInstance' });

const ports = resources.DevelopmentLightsailInstance.Properties.Networking.Ports;
assert.deepEqual(
  ports.map(({ FromPort, ToPort, Protocol }) => [FromPort, ToPort, Protocol]),
  [
    [80, 80, 'tcp'],
    [443, 443, 'tcp']
  ]
);
assert.ok(ports.every(({ AccessType, AccessFrom }) => AccessType === 'Public' && AccessFrom === '0.0.0.0/0'));
assert.equal(
  ports.some(({ FromPort, ToPort }) => FromPort <= 22 && ToPort >= 22),
  false,
  'SSH is not a public Lightsail port'
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
assert.equal(Object.hasOwn(resources.DevelopmentLightsailInstance.Properties, 'UserData'), false);
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
  'AWS::AccountId': '123456789012',
  'AWS::Region': 'ap-southeast-1'
};
const values = {
  DevelopmentEcrRepository: 'mmdc-v3-development-app',
  DevelopmentMediaBucket: 'mmdc-v3-development-media-123456789012',
  DevelopmentDeploymentStateBucket: 'mmdc-v3-development-deployment-state-123456789012'
};
function render(value) {
  if (typeof value === 'string') return value;
  if (value == null) return value;
  if (value.Ref) return refs[value.Ref] ?? values[value.Ref] ?? `REF(${value.Ref})`;
  if (value['Fn::GetAtt']) {
    const [logicalId, attribute] = value['Fn::GetAtt'];
    if (attribute === 'Arn' && values[logicalId]) {
      if (logicalId === 'DevelopmentEcrRepository')
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
function allows(statement, action, resource) {
  if (statement.Effect !== 'Allow' || !listActions(statement).includes(action)) return false;
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
const publisherStatements = policyStatements(resources.GitHubPublisherRole).map((statement) => ({
  ...statement,
  renderedResource: render(statement.Resource)
}));
const hostStatements = policyStatements(resources.DevelopmentHostWorkloadUser).map((statement) => ({
  ...statement,
  renderedResource: render(statement.Resource)
}));
const ecrArn = render({ 'Fn::GetAtt': ['DevelopmentEcrRepository', 'Arn'] });
const mediaPrefix = `${render({ 'Fn::GetAtt': ['DevelopmentMediaBucket', 'Arn'] })}/media/record-00000000/file.png`;
const mediaOtherPrefix = `${render({ 'Fn::GetAtt': ['DevelopmentMediaBucket', 'Arn'] })}/private/file.png`;
const stateArn = render({ 'Fn::GetAtt': ['DevelopmentDeploymentStateBucket', 'Arn'] });

assert.equal(
  publisherStatements.some((statement) => allows(statement, 'ecr:PutImage', `${ecrArn}`)),
  true,
  'publisher allows image publication to the development repository'
);
assert.equal(
  publisherStatements.some((statement) => allows(statement, 'ecr:PutImage', ecrArn.replace(/app$/, 'other'))),
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

const trustStatement = resources.GitHubPublisherRole.Properties.AssumeRolePolicyDocument.Statement[0];
assert.equal(trustStatement.Principal.Federated.Ref, 'GitHubOidcProvider');
assert.equal(trustStatement.Condition.StringEquals['token.actions.githubusercontent.com:aud'], 'sts.amazonaws.com');
const trustedSub = render(trustStatement.Condition.StringLike['token.actions.githubusercontent.com:sub']);
const trustedWorkflow = render(
  trustStatement.Condition.StringLike['token.actions.githubusercontent.com:job_workflow_ref']
);
const globMatches = (glob, value) =>
  new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`).test(value);
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

const costRegister = readFileSync('docs/registers/cost-retention-register.md', 'utf8');
for (const subject of [
  'S3 media objects and noncurrent versions',
  'ECR image storage and scan artifacts',
  'Lightsail instance, static IP, attached state, and snapshots'
]) {
  assert.match(costRegister, new RegExp(`\\|[^|]*${subject}[^|]*\\|`));
}
const costOutput = template.Outputs.MonthlyPlanningCostEstimate.Value;
assert.match(costOutput, /USD 40-125 per month/);
assert.match(costOutput, /USD 40-265/);
assert.match(costRegister, /planning envelope is \*\*USD 40–265 per month\*\*/);

console.log(
  'F08-T01 probe: JSON CloudFormation validation/lint, resource inventory, private buckets, retention, region, ports, secret boundary, cost output, and IAM allow/deny simulations passed'
);

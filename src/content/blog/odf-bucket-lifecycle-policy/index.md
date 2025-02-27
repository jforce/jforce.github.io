---
title: "Managing Data Retention with Bucket Lifecycle Policies"
description: "How to configure LokiStack log retention for ODFs MCG."
date: "Feb 26 2025"
---

With OpenShift's shift from EFK to LokiStack, logs are now stored in an object storage bucket. This transition introduces a new requirement: managing log data retention directly within a bucket, so to do this lifecycle policies come into play. From the technical point of view, this feature is available since ODF 4.11 ([BZ 2029298](https://bugzilla.redhat.com/show_bug.cgi?id=2029298)), however, from a support point of view 'Lifecycle bucket configuration in MCG', [is only supported from ODF 4.14](https://access.redhat.com/articles/5001441). For further details, see the KCS article [Applying bucket policies to noobaa buckets](https://access.redhat.com/solutions/6997904).

To configure a lifecycle policy, you can use either s3cmd or AWS CLI. Below are the steps for both approaches.

### s3cmd
Use the following commands to configure s3cmd and set bucket policies:

Retrieve the S3 endpoint:
```bash
oc get route -n openshift-storage s3 -o jsonpath='{.spec.host}'
```
Configure s3cmd:
```bash
s3cmd --configure

Enter new values or accept defaults in brackets with Enter.
Refer to user manual for detailed description of all options.

Access key and Secret key are your identifiers for Amazon S3. Leave them empty for using the env variables.
Access Key: XXXXXXXXXXXXXX
Secret Key: XXXXXXXXXXXXXX
Default Region [US]:
Use "s3.amazonaws.com" for S3 Endpoint and not modify it to the target Amazon S3.
S3 Endpoint [s3.amazonaws.com]: s3-openshift-storage.apps.ocp.lab.com
Use "%(bucket)s.s3.amazonaws.com" to the target Amazon S3. "%(bucket)s" and "%(location)s" vars can be used
DNS-style bucket+hostname:port template for accessing a bucket: [%(bucket).s3-openshift-storage.apps.ocp.lab.com]:
Use HTTPS protocol [Yes]: No
```

Enter the S3 access key, secret key, and endpoint values. Ensure the bucket and lifecycle policy are properly set. Then, save the configurations and test connectivity.

This command will expire/remove all objects in the bucket that are older then 7 days:
```bash
s3cmd expire s3://my.bucket --expiry-days 7
```
View the current lifecycle policy of a bucket:
```bash
s3cmd getlifecycle s3://bucketname
```

To tune the policy to define multiple rules e.g. one of app logs and one for infra logs (different prefixes) to have different levels of retention this has to be done in a slightly different way as the expire option doesn't support multiple arguments with multiple rules, see [s3cmd issue 863](https://github.com/s3tools/s3cmd/issues/863).

To set multiple rules see the advice [here](https://stackoverflow.com/questions/49615977/multiple-lifecycles-s3cmd) to which illustrates creating a lifecycle policy with multiple rules. The example below shows how to create a policy with two rules, one for application logs and one for infrastructure logs.

```xml
<?xml version="1.0" ?>
<LifecycleConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Rule>
    <ID>Application purge</ID>
    <Status>Enabled</Status>
    <Filter>
      <Prefix>application/</Prefix>
    </Filter>
    <Expiration>
      <Days>2</Days>
    </Expiration>
  </Rule>
  <Rule>
    <ID>Infrastructure purge</ID>
    <Status>Enabled</Status>
    <Filter>
      <Prefix>infrastructure/</Prefix>
    </Filter>
    <Expiration>
      <Days>7</Days>
    </Expiration>
  </Rule>
</LifecycleConfiguration>
```

Apply the policy:
```bash
s3cmd setlifecycle test.xml s3://loki-bucket-6de6f5ab-9304-430a-809f-0928e42e9722
```

Due to how the data is written the only option for prefixes would be the log type e.g. infra and application.

### AWS CLI

Alternatively, the AWS CLI tooling can also be used in preference to s3cmd if preferred.

```bash
aws --endpoint https://s3-openshift-storage.apps.ocp.lab.com \
    --no-verify-ssl s3api get-bucket-lifecycle-configuration \
    --bucket loki-bucket-6de6f5ab-9304-430a-809f-0928e42e9722
```

Create a JSON file (example_policy.json) with multiple retention rules:
```json
{
  "Rules": [
    {
      "ID": "application prune",
      "Status": "Enabled",
      "Filter": {
        "Prefix": "application"
      },
      "Expiration": {
        "Days": 1
      }
    },
    {
      "ID": "infrastructure prune",
      "Status": "Enabled",
      "Filter": {
        "Prefix": "infrastructure"
      },
      "Expiration": {
        "Days": 2
      }
    }
  ]
}
```
Apply the policy to the bucket:
```bash
aws --endpoint https://s3-openshift-storage.apps.ocp.lab.com \
    --no-verify-ssl s3api put-bucket-lifecycle-configuration \
    --bucket loki-bucket-6de6f5ab-9304-430a-809f-0928e42e9722 \
    --lifecycle-configuration  file://examplepolicy.json
```

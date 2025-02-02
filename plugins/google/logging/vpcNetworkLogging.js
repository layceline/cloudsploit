var async = require('async');
var helpers = require('../../../helpers/google');

module.exports = {
    title: 'VPC Network Logging',
    category: 'Logging',
    domain: 'Management and Governance',
    severity: 'Medium',
    description: 'Ensures that logging and log alerts exist for VPC network changes',
    more_info: 'Project Ownership is the highest level of privilege on a project, any changes in VPC network should be heavily monitored to prevent unauthorized changes.',
    link: 'https://cloud.google.com/logging/docs/logs-based-metrics/',
    recommended_action: 'Ensure that log metric and alert exist for VPC network changes.',
    apis: ['metrics:list', 'alertPolicies:list', 'networks:list'],
    compliance: {
        pci: 'PCI requires tracking and monitoring of all access to environments ' +
            'in which cardholder data is present. VPC network logging ' +
            'helps audit all network changes.',
        hipaa: 'HIPAA requires the logging of all activity ' +
            'including access and all actions taken.'
    },

    run: function(cache, settings, callback) {
        var results = [];
        var source = {};
        var regions = helpers.regions();

        async.each(regions.alertPolicies, function(region, rcb){
            let networks = helpers.addSource(
                cache, source, ['networks', 'list', region]);

            if (!networks) return rcb();

            if (networks.err || !networks.data) {
                helpers.addResult(results, 3, 'Unable to query VPC networks: ' + helpers.addError(networks), region, null, null, networks.err);
                return rcb();
            }

            if (!networks.data.length) {
                helpers.addResult(results, 0, 'No VPC networks found', region);
                return rcb();
            }
            var metrics = helpers.addSource(cache, source,
                ['metrics', 'list', region]);

            var alertPolicies = helpers.addSource(cache, source,
                ['alertPolicies', 'list', region]);

            if (!metrics || !alertPolicies) return rcb();

            if ((metrics.err && metrics.err.length > 0) || !metrics.data) {
                helpers.addResult(results, 3,
                    'Unable to query for log metrics: ' + helpers.addError(metrics), region, null, null, metrics.err);
                return rcb();
            }

            if ((alertPolicies.err && alertPolicies.err.length > 0) || !alertPolicies.data ) {
                helpers.addResult(results, 3,
                    'Unable to query for log alert policies: ' + helpers.addError(alertPolicies), region, null, null, alertPolicies.err);
                return rcb();
            }

            if (!metrics.data.length > 0) {
                helpers.addResult(results, 2, 'No log metrics found', region);
                return rcb();
            }

            if (!alertPolicies.data.length > 0) {
                helpers.addResult(results, 2, 'No log alert policies found', region);
                return rcb();
            }

            var metricExists = false;
            var metricName = '';

            var testMetrics = [
                'resource.type=gce_network AND protoPayload.methodName="beta.compute.networks.insert"',
                'protoPayload.methodName="beta.compute.networks.patch"',
                'protoPayload.methodName="v1.compute.networks.delete"',
                'protoPayload.methodName="v1.compute.networks.removePeering"',
                'protoPayload.methodName="v1.compute.networks.addPeering"'
                
            ];

            let disabled = false;
            for (let metric of metrics.data) {
                if (metric.filter) {
                    if (metricExists) continue;
                    var checkMetrics = metric.filter.trim().replace(/\r|\n/g, '');
                    var missingMetrics = [];

                    testMetrics.forEach(testMetric => {
                        if (checkMetrics.indexOf(testMetric) === -1) {
                            missingMetrics.push(testMetric);
                        }
                    });

                    if (missingMetrics.length === 0) {
                        if (metric.disabled) disabled = true;
                        else {
                            disabled = false;
                            metricExists = true;
                            metricName = metric.metricDescriptor.type;
                        }
                    }
                }
            }

            if (disabled) {
                helpers.addResult(results, 2, 'Log metric for VPC network changes is disbled', region);
            } else if (metricExists && metricName.length) {
                var conditionFound = false;

                alertPolicies.data.forEach(alertPolicy => {
                    if (conditionFound) return;
                    if (alertPolicy.conditions &&
                        alertPolicy.conditions.length) {
                        alertPolicy.conditions.forEach(condition => {
                            if (conditionFound) return;
                            if (condition.conditionThreshold &&
                                condition.conditionThreshold.filter) {
                                var conditionFilter = condition.conditionThreshold.filter.split('"')[1];
                                if (conditionFilter === metricName) {
                                    conditionFound = true;
                                    helpers.addResult(results, 0, 'Log alert for VPC network changes is enabled', region, alertPolicy.name);
                                }
                            }
                        });
                    }
                });

                if (!conditionFound) {
                    helpers.addResult(results, 2, 'Log alert for VPC network changes not found', region);
                }
            } else {
                helpers.addResult(results, 2, 'Log metric for VPC network changes not found', region);
            }

            rcb();
        }, function(){
            // Global checking goes here
            callback(null, results, source);
        });
    }
};
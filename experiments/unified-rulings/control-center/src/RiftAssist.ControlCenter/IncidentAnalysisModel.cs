using RiftAssist.ControlCenter.Core;

namespace RiftAssist.ControlCenter;

public sealed partial class OperationsModel
{
    public async Task<IncidentInput> ReadIncidentInputAsync(OperationsReport report)
    {
        if(report.Source=="수동 · 로컬")return IncidentInput.Manual(ReadManualReport(report));
        if(report.Source=="Azure · 운영"){
            if(!AzureMode)throw new ControlException("client-analysis-stale");
            var session=remoteAdmin??throw new ControlException("client-admin-authentication");
            var value=await session.ReadAsync("/api/reports/"+report.Id);
            if(session!=remoteAdmin||!AzureMode||value.Field("id").Text()!=report.Id)throw new ControlException("client-analysis-stale");
            return IncidentInput.Api(value,"azure-api");
        }
        if(AzureMode||operations is null)throw new ControlException("client-analysis-stale");
        var current=operations;var detail=await current.ReadAsync("report",new{id=report.Id});
        if(current!=operations||AzureMode||detail.Field("id").Text()!=report.Id)throw new ControlException("client-analysis-stale");
        return IncidentInput.Api(detail,"synthetic-development");
    }
}

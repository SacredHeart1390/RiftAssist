using System.Diagnostics;
using System.Text.Json;

namespace RiftAssist.ControlCenter.Core;

// Only verified existing pure search/card/prompt modules. No server.js, DB, source monitor or network provider.
public sealed class OfflineIncidentAnalyzer(BackendLayout layout):IIncidentAnalyzer
{
    private const string Script="""
    const retrieval=require('./src/retrieval'),cards=require('./src/cards'),policy=require('./src/answer-policy');
    let text='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>{text+=s;if(text.length>220000)process.exit(2)});
    process.stdin.on('end',()=>{try{const p=JSON.parse(text);if(typeof p.text!=='string')throw Error();
      const catalog=cards.normalizeCatalog({schemaVersion:1,version:'analysis-empty-not-official',cards:[]});
      const found=retrieval.search(retrieval.buildIndex([]),p.text,[]);
      process.stdout.write(JSON.stringify({retrievalPolicy:retrieval.VERSION,answerPolicy:policy.VERSION,cardCount:catalog.cards.length,
        selectedRuleIds:found.trace.selectedIds,missingRequired:found.trace.missingRequired,officialEvidenceConnected:false}));
    }catch{process.exitCode=2}});
    """;
    public async Task<IncidentFinding> AnalyzeAsync(PrivacyPacket packet,CancellationToken cancellation)
    {
        var info=new ProcessStartInfo(layout.Node){WorkingDirectory=layout.Root,UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true,StandardInputEncoding=ProtocolJson.Utf8,StandardOutputEncoding=ProtocolJson.Utf8};
        info.Environment.Clear();foreach(var key in new[]{"SystemRoot","WINDIR"})if(Environment.GetEnvironmentVariable(key)is{}value)info.Environment[key]=value;
        info.ArgumentList.Add("-e");info.ArgumentList.Add(Script);using var timeout=CancellationTokenSource.CreateLinkedTokenSource(cancellation);timeout.CancelAfter(TimeSpan.FromSeconds(15));
        using var p=Process.Start(info)??throw new ControlException("client-analysis-worker");using var registration=timeout.Token.Register(()=>ChildProcess.Stop(p));
        try{
            var errors=ChildProcess.DrainAsync(p.StandardError);
            await p.StandardInput.WriteAsync(JsonSerializer.Serialize(new{text=packet.Text}).AsMemory(),timeout.Token);p.StandardInput.Close();
            var output=new char[32769];var n=0;while(true){var size=await p.StandardOutput.ReadAsync(output.AsMemory(n),timeout.Token);if(size==0)break;n+=size;if(n>32768)throw new IOException();}
            await p.WaitForExitAsync(timeout.Token);await errors;if(p.ExitCode!=0)throw new IOException();using var d=JsonDocument.Parse(new string(output,0,n));
            if(d.RootElement.GetProperty("officialEvidenceConnected").GetBoolean()||d.RootElement.GetProperty("cardCount").GetInt32()!=0)throw new IOException();
            return IncidentAnalysisPolicy.Conservative(packet,PrivacyPacket.Create(d.RootElement.GetRawText()).Text);
        }catch(OperationCanceledException){throw new ControlException("client-analysis-cancelled");}catch{throw new ControlException("client-analysis-worker");}finally{ChildProcess.Stop(p);}
    }
}

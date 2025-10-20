$ClientCredential = get-secret -Name RedditClientCred
$UserCredential = Get-Secret -Name RedditUserCred
$RedirectUri = 'https://127.0.0.1'
$UserAgent = 'windows:ZacCash-cfbcommentstream:v0.0.0.1 (by /u/zac-run)'
$Params = @{
    Script           = $True
    Name             = "cfbcommentstream"
    Description      = 'cfbcommentstream - /u/zac-run'
    ClientCredential = $ClientCredential
    UserCredential   = $UserCredential
    RedirectUri      = $RedirectUri
    UserAgent        = $UserAgent 
}
$RedditApp = New-RedditApplication @Params
$RedditApp | Request-RedditOAuthToken -Script
$flairURLs = @{Label="FlairURLs";Expression={($_.author_flair_richtext.u | Out-String).Trim()}}
$flairtext = @{Label="FlairText";Expression={($_.author_flair_richtext.t | Out-String).Trim()}}

$masterobject = [PSCustomObject]@{
    gamethread = $null
    title = $null
    Comments = [System.Collections.Generic.List[Object]]::new()
    apistatus = $null
}
$gamethread = "https://oauth.reddit.com/r/CFB/comments/1oa9edx/"

$result = Invoke-RedditRequest -Uri "$gamethread.json?Sort=new"
$apistatus = ($result.Response.Headers | convertto-json | ConvertFrom-Json) | Select-Object 'x-ratelimit-remaining','x-ratelimit-reset','x-ratelimit-used'
$content = $result.ContentObject[1].data.children | Where-Object { $_.kind -eq 't1' }
$masterdata = [System.Collections.Generic.List[Object]]::new()
$masterdata.AddRange(($content.data | select-object id, parent_id, created, author, body, ups, $flairURLs, $flairtext, replies, repliesParsed, repliesCount))
$masterdata | where-object { $_.replies.data -ne $null } | ForEach-Object {
    $_.repliesCount = $_.replies.data.children.Count
    $_.repliesParsed = $_.replies.data.children.data | select-object id, parent_id, created,author, body, ups, $flairURLs, $flairtext
    $_.replies = $null
}

$masterobject.gamethread = $gamethread
$masterobject.title = ($result.ContentObject[0].data.children[0].data.title)
$masterobject.comments = $masterdata | Sort-Object -Property created -Descending
$masterobject.apistatus = $apistatus
$masterobject | ConvertTo-Json -Depth 10 | Out-File -FilePath ".\comments.json" -Encoding UTF8 -Force

#LEt's make this a function
function update-redditdata {
    param (
        [Parameter(Mandatory=$true)]
        [System.Collections.Generic.List[Object]]$masterdata
    )
    $result = Invoke-RedditRequest -Uri "$gamethread.json?Sort=new&truncate=25"
    $global:apistatus = ($result.Response.Headers | convertto-json | ConvertFrom-Json) | Select-Object 'x-ratelimit-remaining','x-ratelimit-reset','x-ratelimit-used'
    $content = $result.ContentObject[1].data.children | Where-Object { $_.kind -eq 't1' -or $_.kind -eq 'more' }
    $newdata = [System.Collections.Generic.List[Object]]::new()
    $content.data | select-object id, parent_id, created, author, body, ups, $flairURLs, $flairtext, replies, repliesParsed, repliesCount | ForEach-Object {
        $newdata.Add($_)
    }
    $newdata | where-object { $null -ne $_.replies.data } | ForEach-Object {
        $_.repliesCount = $_.replies.data.children.Count
        $_.repliesParsed = $_.replies.data.children.data | select-object id, parent_id, created, author, body, ups, $flairURLs, $flairtext
        $_.replies = $null
    }
    $newcomments = $newdata | where-object { $masterdata.id -notcontains $_.id }
    if ($newcomments) {
        write-host "Adding $($newcomments.Count) new comments"
        $newcomments | ForEach-Object {
            $masterdata.Add($_)
        }
    }
    
    $newdata | where-object { $_.repliesCount -gt 0 } | ForEach-Object {
        $messageid = $_.ID
        $New_repliesparsed = $_.repliesParsed
        $new_repliescount = $_.repliesCount
        $mastercomment = $masterdata | where-object { $_.id -eq $messageid }
        
        if ($mastercomment.repliesCount -lt $_.repliesCount) {
            try {
                write-host "Adding new $new_repliescount comments"
                $masterdata | where-object { $_.id -eq $messageid } | foreach-object {
                    $_.repliesParsed = $New_repliesparsed
                    $_.repliesCount = $new_repliescount
                }
            }
            catch {
                write-host "Error updating replies for $messageid"
            }

        }
    }
    return $masterdata
}

while ($true) {
    Start-Sleep -Seconds 3
    $masterobject.apistatus = $global:apistatus
    $masterdata = update-redditdata -masterdata $masterobject.comments
    $masterobject.comments = $masterdata | Sort-Object -Property created -Descending
    $masterobject | ConvertTo-Json -Depth 10 | Out-File -FilePath ".\comments.json" -Encoding UTF8 -Force
}


const express=require('express');
const app=express();
const port=8000;
const path=require('path');
const fs=require('fs').promises;
const {authenticate}=require('@google-cloud/local-auth');
const {google}=require('googleapis');

const SCOPES=[
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.labels',
    'https://www.googleapis.com/auth/gmail.send',
    'https://mail.google.com',
    //LEVEL OF ACESSS WE WANT FROM USERS
];

app.get('/',async(req,res)=>{

    const credentials=await fs.readFile('credentials.json');
    //reads credental from file using fs module

    const auth=await authenticate({ //authorize client with credentials
        keyfilePath : path.join(__dirname,'credentials.json'),
        scopes:SCOPES,
    });



    const gmail=google.gmail({version:'v1',auth});// object to use gmail API

    const response=await gmail.users.labels.list({
        userId:'me',
    });        // getting the label in gmail account 

    const LABEL_NAME='Vacation';

    //load credentials from file
    async function loadCredentials(){
        const filePath=path.join(process.cwd(),'credentials.json');
        const content=await fs.readFile(filePath,{encoding:'utf8'});
        return JSON.parse(content);
    }


    // get the messages with no prior replies
    async function getUnrepliedMessages(auth)
    {
        const gmail=google.gmail({ //  instance of Gmail API client by which we can query gmail api endpoints
            version:'v1',
            auth
        });
        const res=await gmail.users.messages.list({
            userId :'me',
            q:'-in:chats -from:me -has:userlabels', //filter messages
        });
        return res.data.messages || [];
    }
    

    // sending reply to messages
    async function sendReply(auth, message) 
    {
        const gmail = google.gmail({
          version: 'v1',
          auth
        });
        const res = await gmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'metadata',
          metadataHeaders: ['Subject', 'From'],
        });// gets metaData of msg by msgID
        
        
        const subject = res.data.payload.headers.find((header) => header.name === 'Subject').value;
        const fromHeader = res.data.payload.headers.find((header) => header.name === 'From');
        const from = fromHeader && fromHeader.value;
      
        if (!from) {
          console.error('Unable to extract "From" header from the message:', message);
          return;
        }
      
        const replyToMatch = from.match(/<(.*)>/);      //extract email id
        const replyTo = replyToMatch ? replyToMatch[1] : from;
        const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
        const replyBody = 'Hi, I will reach out to you!';
        const rawMessage = [
          `From: me`,
          `To: ${replyTo}`,
          `Subject: ${replySubject}`,
          `In-Reply-To: ${message.id}`,
          `References: ${message.id}`,
          '',
          replyBody,
        ].join('\n');
      
        const encodedMessage = Buffer.from(rawMessage).toString('base64').replace(/\+/g, '').replace(/\//g, '').replace(/=+$/, '');
      
        await gmail.users.messages.send({
          userId: 'me',
          requestBody: {
            raw: encodedMessage,
          },
        });
      }
      

 async function createLabel(auth){
    const gmail=google.gmail({version:'v1',auth});
    try{
        const res =await gmail.users.labels.create({
            userId:'me',
            requestBody:{
                name:LABEL_NAME,
                labelListVisibility:'labelShow',
                messageListVisibility:'show',
            }
        });
        return res.data.id;
    }catch(err){
        if(err.code===409)
        {
            //Label exists
            const res =await gmail.users.labels.list({
                userId:'me',
            });
            const label=res.data.labels.find((label)=>label.name===LABEL_NAME);
            return label.id;

        }else{
            throw err;
        }
    }
}

async function addLabel(auth,message,labelId)
{
    const gmail=google.gmail({
        version:'v1',
         auth
    });
    await gmail.users.messages.modify({
        userId: 'me',
        id:message.id,
        requestBody:{
            addLabelIds:[labelId],
            removeLabelIds:['INBOX'],
        },
    });

}

async function main(){
    const labelId=await createLabel(auth)

    setInterval(async()=>{
        const messages=await getUnrepliedMessages(auth);

        for(const message of messages){

            await sendReply(auth,message);
            await addLabel(auth,message,labelId);

        }
    },Math.floor(Math.random()*(120-45+1)+45)*100);
}

main().catch(console.error);

});

app.listen(port,()=>{
    console.log('ok');
});
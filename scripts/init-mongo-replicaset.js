// MongoDB Replica Set Initialization Script
// This script initializes a 3-node replica set with automatic primary election

try {
  print("🔧 Starting MongoDB Replica Set initialization...");
  print("📋 Checking if replica set is already initialized...");
  
  const status = rs.status();
  
  if (status.ok === 1) {
    print("✓ Replica set already initialized");
    print("📊 Current status:");
    printjson(status);
    
    print("\n📊 Members:");
    status.members.forEach((member, idx) => {
      print(`  ${idx + 1}. ${member.name} - ${member.stateStr}`);
    });
    
    print("\n✅ Replica set is healthy and operational");
    quit(0);
  }
} catch (error) {
  print("ℹ️  Replica set not yet initialized. Proceeding with initialization...");
}

print("\n🚀 Initializing replica set 'rs0' with 3 members...");
print("  - mongo1:27017 (Primary candidate, priority: 2)");
print("  - mongo2:27017 (Secondary, priority: 1)");
print("  - mongo3:27017 (Arbiter, no data storage)");

try {
  const config = {
    _id: "rs0",
    members: [
      {
        _id: 0,
        host: "mongo1:27017",
        priority: 2,
        arbiterOnly: false
      },
      {
        _id: 1,
        host: "mongo2:27017",
        priority: 1,
        arbiterOnly: false
      },
      {
        _id: 2,
        host: "mongo3:27017",
        arbiterOnly: true
      }
    ],
    settings: {
      electionTimeoutMillis: 5000,
      heartbeatIntervalMillis: 2000,
      heartbeatTimeoutMillis: 2000
    }
  };

  const result = rs.initiate(config);
  
  if (result.ok === 1) {
    print("\n✅ Replica set initialization initiated successfully!");
    printjson(result);
  } else {
    print("\n❌ Failed to initiate replica set");
    printjson(result);
    quit(1);
  }
  
  print("\n⏳ Waiting for primary election (5 seconds)...");
  sleep(5000);
  
  print("\n📊 Checking replica set status...");
  const finalStatus = rs.status();
  
  print("\n✅ Replica Set Initialized Successfully!");
  print("\n📊 Status:");
  print(`  Set name: ${finalStatus.set}`);
  print(`  Date: ${finalStatus.date}`);
  print(`  My state: ${finalStatus.myState}`);
  
  print("\n📊 Members:");
  finalStatus.members.forEach((member, idx) => {
    const icon = member.stateStr === 'PRIMARY' ? '👑' : 
                 member.stateStr === 'SECONDARY' ? '📦' : 
                 member.stateStr === 'ARBITER' ? '⚖️' : '❓';
    print(`  ${icon} ${idx + 1}. ${member.name} - ${member.stateStr}`);
  });
  
  print("\n✅ MongoDB Replica Set is ready!");
  print("💡 Primary will be elected automatically from availablenodes");
  
} catch (error) {
  print("\n❌ Error during initialization:");
  print(`  ${error.message}`);
  print("\n📋 Full error:");
  printjson(error);
  
  print("\n💡 Troubleshooting:");
  print("  1. Ensure all MongoDB containers are running");
  print("  2. Check network connectivity between nodes");
  print("  3. Verify port mappings (27017, 27018, 27019)");
  print("  4. Check MongoDB logs: docker logs attendance-mongo1");
  
  quit(1);
}

quit(0);

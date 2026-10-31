add_executable(PersonalVault
    main.cpp
    PersonalVaultWindow.cpp
    PersonalVaultWindow.h
    personalvault.qrc
)

target_include_directories(PersonalVault PRIVATE
    ${CMAKE_SOURCE_DIR}/src
    ${CMAKE_BINARY_DIR}/src
)

target_link_libraries(PersonalVault "$<LINK_GROUP:RESCAN,keepassxc_gui,browser>" Qt6::Widgets)

if(WIN32)
    set_target_properties(PersonalVault PROPERTIES WIN32_EXECUTABLE ON)
endif()

# Native messaging needs keepassxc-proxy.exe accessible from the app directory.
if(TARGET keepassxc-proxy)
    add_dependencies(PersonalVault keepassxc-proxy)
    add_custom_command(TARGET PersonalVault POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
            $<TARGET_FILE:keepassxc-proxy>
            $<TARGET_FILE_DIR:PersonalVault>)
endif()

# Make the build directory self-contained so the proxy can be launched by the
# browser without relying on the developer's PATH.
if(WIN32 AND DEPLOYQT_EXE)
    add_custom_command(TARGET PersonalVault POST_BUILD
        COMMAND ${DEPLOYQT_EXE}
            --dir $<TARGET_FILE_DIR:PersonalVault>
            --compiler-runtime
            $<IF:$<CONFIG:Debug>,--debug,--release>
            $<TARGET_FILE:PersonalVault>)
endif()
